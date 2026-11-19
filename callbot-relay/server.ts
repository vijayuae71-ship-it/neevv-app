/**
 * Twilio ConversationRelay WebSocket server for the calling bot.
 *
 * Twilio does speech recognition and neural text-to-speech; this server gets
 * the caller's words, streams Claude's reply back token by token (so speech
 * starts almost immediately), handles barge-in, and switches language mid-call.
 *
 * Deploy as its own Cloud Run service (WebSockets need a long-lived
 * connection). Env: same as the app, plus CALLBOT_RELAY_URL = this service's
 * public wss:// URL, e.g. wss://callbot-relay-xxxx.a.run.app/relay
 */
import { createServer, type IncomingMessage } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { getPlaybook, resolveLanguage } from '@/lib/callbot/playbook';
import { addDoNotCall, getCall, saveCall, upsertLead } from '@/lib/callbot/store';
import { finalizeCall, markInterrupted, modelOpening, prospectTurn, scriptedGreeting } from '@/lib/callbot/session';
import { verifySignatureForUrl } from '@/lib/callbot/twilio';
import type { CallAction, CallState, Playbook } from '@/lib/callbot/types';

const PORT = Number(process.env.PORT || 8080);
const RELAY_URL = process.env.CALLBOT_RELAY_URL || '';
/** If no reply token arrives within this many ms, say a short filler ("Hmm, okay.") so the line isn't dead. */
const FILLER_MS = Number(process.env.CALLBOT_FILLER_MS || 1400);
/** Nudge the caller after this much silence once the bot has finished talking. */
const IDLE_MS = Number(process.env.CALLBOT_IDLE_MS || 9000);

type Outbound =
  | { type: 'text'; token: string; last: boolean; lang?: string; interruptible?: boolean }
  | { type: 'language'; ttsLanguage: string; transcriptionLanguage: string }
  | { type: 'end'; handoffData?: string };

/** Rough time the TTS needs to finish speaking `text`, so we don't hang up mid-sentence. */
function speakingMs(text: string): number {
  return Math.min(15_000, 1200 + (text.length / 14) * 1000);
}

class CallSession {
  private state: CallState | null = null;
  private pb: Playbook | null = null;
  private current: { abort: AbortController } | null = null;
  private pendingInterrupt: string | undefined;
  private idle: NodeJS.Timeout | null = null;
  private lastSpokenAt = 0;
  private ended = false;
  /** Turns run one at a time; a new one aborts the one in flight first. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Turns queued or running; the silence timer only runs when this is 0. */
  private inFlight = 0;
  private finalized = false;

  constructor(private ws: WebSocket) {}

  private send(msg: Outbound) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  async onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'setup':
        return this.onSetup(msg);
      case 'prompt':
        if (msg.last === false) return; // partial transcript; wait for the final one
        return this.runTurn(String(msg.voicePrompt || ''));
      case 'interrupt':
        return this.onInterrupt(String(msg.utteranceUntilInterrupt || ''));
      case 'dtmf':
        return; // keypad presses ignored for now
      case 'error':
        console.error('relay: Twilio error', msg.description);
        return;
    }
  }

  private async onSetup(msg: any) {
    const ref = msg.customParameters?.ref || msg.callSid;
    const state = ref ? await getCall(ref) : null;
    if (!state) {
      console.error('relay: no call state for', ref);
      this.send({ type: 'text', token: "Sorry, something went wrong on our side. We'll call you back.", last: true });
      return this.endSession('end', 2500);
    }
    this.state = state;
    this.pb = getPlaybook(state.playbookId);
    state.twilioSid = msg.callSid || state.twilioSid;
    state.relayConnected = true;
    state.channel = 'relay';

    const greeting = scriptedGreeting(this.pb, state);
    if (greeting && state.transcript.length === 1) {
      // Twilio already spoke it as welcomeGreeting; the voice route recorded it.
      this.lastSpokenAt = Date.now() + speakingMs(greeting);
      this.armIdle();
    } else if (!greeting && !state.transcript.length) {
      this.inFlight += 1;
      const p = this.queue
        .then(() => this.stream((io) => modelOpening(this.pb!, state, io)))
        .finally(() => {
          this.inFlight -= 1;
          this.armIdle();
        });
      this.queue = p.catch(() => {});
      await p;
    }
    await saveCall(state).catch((e) => console.error('relay: save', e));
  }

  private onInterrupt(heard: string) {
    if (!this.state) return;
    if (this.current) {
      // Still generating: stop, and remember what they heard.
      this.pendingInterrupt = heard;
      this.current.abort.abort();
    } else {
      // Reply was fully generated but TTS got cut off.
      markInterrupted(this.state, heard);
      this.pendingInterrupt = heard;
    }
  }

  private runTurn(speech: string) {
    if (!this.state || !this.pb || this.ended) return;
    this.clearIdle();
    // Caller spoke over a reply that's still generating: drop it, then go.
    this.current?.abort.abort();
    this.inFlight += 1;
    const p = this.queue
      .then(() => this.doTurn(speech))
      .finally(() => {
        this.inFlight -= 1;
        if (!this.ended) this.armIdle();
      });
    this.queue = p.catch(() => {});
    return p;
  }

  private async doTurn(speech: string) {
    if (!this.state || !this.pb || this.ended) return;
    const interruptedAfter = this.pendingInterrupt;
    this.pendingInterrupt = undefined;
    const state = this.state;
    const pb = this.pb;

    const r = await this.stream((io) => prospectTurn(pb, state, speech, io, interruptedAfter));
    if (!r) return;
    if (state.optOut) await addDoNotCall(state.lead.phone, 'Asked on call').catch(console.error);
    saveCall(state).catch((e) => console.error('relay: save', e));

    if (r.action !== 'continue') {
      await this.endSession(r.action, speakingMs(r.text));
    }
  }

  /** Run one model turn, streaming its tokens to Twilio, with a filler if it's slow. */
  private async stream(
    fn: (io: { onText: (d: string) => void; onLanguage: (l: any) => void; signal: AbortSignal }) => Promise<{
      text: string;
      action: CallAction;
      aborted: boolean;
    }>,
  ) {
    const state = this.state!;
    const pb = this.pb!;
    const abort = new AbortController();
    this.current = { abort };

    let first = true;
    const lang = () => resolveLanguage(pb, state.language);
    const filler = setTimeout(() => {
      const options = lang().fillers || [];
      // Fillers sound natural now and then, robotic every time.
      if (first && options.length && state.turns > 0 && Math.random() < 0.6) {
        this.send({ type: 'text', token: options[Math.floor(Math.random() * options.length)] + ' ', last: false });
      }
    }, FILLER_MS);

    try {
      const r = await fn({
        signal: abort.signal,
        onLanguage: (l) => {
          this.send({ type: 'language', ttsLanguage: l.code, transcriptionLanguage: l.transcriptionLanguage || l.code });
        },
        onText: (d) => {
          if (abort.signal.aborted) return;
          first = false;
          this.send({ type: 'text', token: d, last: false });
        },
      });
      if (r.aborted) {
        if (r.text) state.transcript.push({ role: 'bot', text: `${r.text.trim()} [interrupted]`, at: new Date().toISOString() });
        return null;
      }
      this.send({ type: 'text', token: '', last: true });
      this.lastSpokenAt = Date.now() + speakingMs(r.text);
      return r;
    } catch (err) {
      console.error('relay: turn error', err);
      return null;
    } finally {
      clearTimeout(filler);
      if (this.current?.abort === abort) this.current = null;
    }
  }

  private armIdle() {
    this.clearIdle();
    if (this.inFlight > 0 || this.ended) return;
    const wait = Math.max(0, this.lastSpokenAt - Date.now()) + IDLE_MS;
    this.idle = setTimeout(() => this.runTurn(''), wait);
  }

  private clearIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }

  /** Let the last sentence finish, then end the ConversationRelay session. */
  private async endSession(action: CallAction, afterMs: number) {
    if (this.ended) return;
    this.ended = true;
    this.clearIdle();
    await new Promise((r) => setTimeout(r, afterMs));
    this.send({
      type: 'end',
      handoffData: JSON.stringify({ ref: this.state?.callSid, action, language: this.state?.language }),
    });
  }

  async onClose() {
    this.clearIdle();
    this.current?.abort.abort();
    if (!this.state || !this.pb || this.finalized) return;
    this.finalized = true;
    const state = this.state;
    try {
      const { result, summary } = await finalizeCall(this.pb, state, 'completed');
      await saveCall(state);
      await upsertLead(state, result, summary);
    } catch (e) {
      console.error('relay: finalize failed', e);
    }
  }
}

function signatureOk(req: IncomingMessage): boolean {
  if (process.env.CALLBOT_SKIP_SIGNATURE === 'true' && process.env.NODE_ENV !== 'production') return true;
  if (!RELAY_URL) {
    console.error('relay: CALLBOT_RELAY_URL is not set; rejecting connection');
    return false;
  }
  const sig = req.headers['x-twilio-signature'];
  const url = new URL(req.url || '/', RELAY_URL);
  return verifySignatureForUrl(url.toString(), typeof sig === 'string' ? sig : null);
}

const server = createServer((req, res) => {
  // Health check for Cloud Run.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('callbot relay ok');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!signatureOk(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const session = new CallSession(ws);
    // Serialise message handling per call.
    let chain = Promise.resolve();
    ws.on('message', (data) => {
      const text = data.toString();
      const parsed = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();
      // Interrupts and new prompts must act immediately, not wait behind a running turn.
      if (parsed?.type === 'interrupt' || parsed?.type === 'prompt') {
        session.onMessage(text).catch((e) => console.error('relay:', e));
      } else {
        chain = chain.then(() => session.onMessage(text)).catch((e) => console.error('relay:', e));
      }
    });
    ws.on('close', () => {
      chain.then(() => session.onClose());
    });
  });
});

server.listen(PORT, () => console.log(`callbot relay listening on :${PORT}`));
