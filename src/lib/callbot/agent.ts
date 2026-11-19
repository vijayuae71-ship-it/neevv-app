import Anthropic from '@anthropic-ai/sdk';
import type { CallAction, CallState, Playbook, VoiceLanguage } from './types';
import { findLanguage, normalizeValue, resolveLanguage, scoreLead } from './playbook';

// The conversation engine. Transport-agnostic: the ConversationRelay WebSocket
// server streams its text straight into text-to-speech, the basic Twilio
// webhook mode and the text simulator just collect it.
//
// Output protocol (plain streamed text, one request per turn, so the first
// words reach the caller as early as possible):
//
//   [[hi-IN]]                 optional, first thing, only when switching language
//   <what to say out loud>
//   <<<{"answers":{...},"action":"continue","callback_time":null,"opt_out":false}>>>
//
// The language tag and the <<<…>>> metadata are stripped before speech.

const MODEL = process.env.CALLBOT_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.CALLBOT_EFFORT || 'low') as 'low' | 'medium' | 'high';

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return _client;
}

type Msg = Anthropic.Beta.BetaMessageParam;

export interface AgentIO {
  /** Spoken text as it streams. */
  onText?: (delta: string) => void;
  /** Called before any text when the model switches language. */
  onLanguage?: (lang: VoiceLanguage) => void;
  signal?: AbortSignal;
}

export interface AgentReply {
  /** Everything said this turn (spoken text only). */
  text: string;
  action: CallAction;
  aborted: boolean;
}

const FALLBACK: Record<string, string> = {
  en: "Sorry, I didn't quite catch that. Could you say that again?",
  hi: 'Maaf kijiye, main theek se sun nahi paayi. Kya aap dobara bol sakte hain?',
  ar: 'عذرًا، لم أسمعك جيدًا. هل يمكنك أن تعيد ذلك؟',
};
export function fallbackLine(code: string): string {
  return FALLBACK[code.split('-')[0]] || FALLBACK.en;
}

/** Stable per playbook, so it is prompt-cached across turns and calls. */
export function buildSystemPrompt(pb: Playbook, canTransfer: boolean): string {
  const fields = pb.fields
    .map((f) => {
      let line = `- ${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.question}`;
      if (f.options) line += ` Allowed values: ${f.options.map((o) => `"${o.value}" = ${o.label}`).join('; ')}.`;
      if (f.type === 'boolean') line += ' Value true or false.';
      if (f.type === 'number') line += ' Value as a plain number.';
      if (f.hint) line += ` Note: ${f.hint}`;
      return line;
    })
    .join('\n');
  const langs = pb.languages
    .map((l) => `- ${l.code}: ${l.name}${l.style ? `. ${l.style}` : ''}`)
    .join('\n');
  const objections = Object.entries(pb.objections || {})
    .map(([o, r]) => `- "${o}": ${r}`)
    .join('\n');

  return `You are ${pb.agentName}, calling on behalf of ${pb.company}. This is a live phone call. What you write is turned into speech the moment you write it, and the caller's words reach you through speech recognition.

Who you are: ${pb.persona || `${pb.agentName}, a friendly, experienced sales rep.`}

# Sound like a real person on the phone
- Talk the way people actually talk: contractions, short sentences, everyday words. Most replies are one or two sentences, under about 30 words. One question at a time.
- React to what they said before moving on, the way a person would: "Oh, nice", "Ah, okay, that makes sense", "Mm, got it". Vary these; never use the same one twice in a row.
- Don't parrot their answer back in full or summarise after every reply. Don't say "Great question" or "I understand your concern". No call-centre phrases.
- Match their energy and formality. If they're brief and busy, be brief. If they're chatty, be a little warmer, and light humour is fine.
- Use their name once or twice in the whole call, not every turn.
- Write numbers, money and dates the way you'd say them in the current language, for example "forty-five lakh", "one point two million dirhams", "next Tuesday".
- Never use lists, markdown, emojis, brackets, or stage directions like *laughs*. Don't spell out URLs or email addresses.
- Speech recognition makes mistakes. If something sounds garbled, make a sensible guess from context and check casually ("Sorry, was that thirty by forty?"), rather than asking them to repeat everything.
- If you're told the caller cut you off, don't restart what you were saying. Respond to what they just said, and only come back to your point if it still matters.
- You are an AI assistant, and the persona above is your name and manner, not a claim to be human. If anyone asks whether you're a bot or a real person, say plainly and lightly that you're an AI assistant for ${pb.company}, then carry on. Never claim to be human.

# Languages
Speak the caller's language. Languages you can use on this call:
${langs}
If the caller speaks, or asks for, a different language from the list, switch: start your reply with the language tag, then speak in that language from then on. If they use a language not on the list, say briefly in English that you can't speak it yet and offer the closest one from the list. If they mix languages (for example Hinglish), it's fine to mix the same way within the current language.

# What you're selling
${pb.product}

Selling points you may use. Don't invent others or make bigger claims:
${pb.valueProps.map((v) => `- ${v}`).join('\n')}

Goal of the call: ${pb.callGoal}

# What to find out
Weave these into the conversation naturally, roughly in this order, skipping anything already known:
${fields}

Suggested replies to common objections. Use them as ideas, in your own words:
${objections || '- (none)'}

# Running the call
- If they're busy, offer a callback and ask when suits them.
- If they ask not to be called again, apologise briefly, confirm they won't be called, and end.
- If they're clearly not a fit, thank them warmly and end.
- Once the required items are known, move to the goal.${canTransfer ? ' If the lead is strong and they agree to talk to a specialist right now, say you are connecting them and use action "transfer".' : ''}
- When the call is done, say a warm, short goodbye in the same reply that ends it.
- Never pressure anyone, never lie, never collect card numbers, bank details, passwords or ID numbers.
${(pb.rules || []).map((r) => `- ${r}`).join('\n')}

# Output format (strict)
Write exactly this, and nothing else:
1. Only if you are switching language this turn: the tag [[code]] first, e.g. [[hi-IN]].
2. Your spoken reply, in the current language and script.
3. On a new line, a metadata line: <<<{"answers": {...}, "action": "...", "callback_time": null, "opt_out": false}>>>
   - answers: any of the keys above that you learned or that were corrected in the caller's latest words, using the allowed values exactly. {} if none.
   - action: "continue", "end", "callback" (they want to be called another time), or "transfer".
   - callback_time: when action is "callback", the time they asked for, in their words; otherwise null.
   - opt_out: true only if they asked not to be called again.
The metadata line is never spoken. Write it in plain JSON, on one line.

Example:
Oh nice, Pune's a lovely place to build. And roughly how big is the plot?
<<<{"answers": {"city": "Pune"}, "action": "continue", "callback_time": null, "opt_out": false}>>>`;
}

function statusBlock(pb: Playbook, state: CallState): string {
  const score = scoreLead(pb, state);
  const max = pb.maxTurns || 14;
  const lang = resolveLanguage(pb, state.language);
  return `<call_status>
Current language: ${lang.code} (${lang.name})
Captured so far: ${JSON.stringify(state.captured)}
Still needed: ${score.missingRequired.join(', ') || 'nothing required'}
Turn ${state.turns + 1} of at most ${max}.${state.silentTurns ? ` The caller has been silent ${state.silentTurns} time(s) in a row${state.silentTurns >= 2 ? ': say you will try them another time, a short goodbye, and use action "callback"' : ': check gently if they are still there'}.` : ''}${state.turns + 1 >= max ? ' Last turn: wrap up warmly and end the call now.' : ''}
</call_status>`;
}

function leadBlock(state: CallState): string {
  return `<lead>
Name: ${state.lead.name || 'unknown'}
Phone: ${state.lead.phone}
Source: ${state.lead.source || 'unknown'}
Already known (don't ask again): ${JSON.stringify(state.lead.known || {})}
Notes: ${state.lead.notes || 'none'}
</lead>`;
}

export type TurnInput =
  | { kind: 'open' }
  | { kind: 'opened'; greeting: string; speech: string }
  | { kind: 'speech'; speech: string; interruptedAfter?: string };

function userTurn(pb: Playbook, state: CallState, input: TurnInput): Msg {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [];
  const first = state.messages.length === 0;
  if (first) blocks.push({ type: 'text', text: leadBlock(state) });
  blocks.push({ type: 'text', text: statusBlock(pb, state) });

  if (input.kind === 'open') {
    const lang = resolveLanguage(pb, state.language);
    blocks.push({
      type: 'text',
      text: `The call just connected and they said hello. Open the call in ${lang.name}: greet them by name, say who you are and where you're calling from, mention you're an AI assistant and the call may be recorded, and ask if now is a good time. Keep it short and natural.`,
    });
  } else if (input.kind === 'opened') {
    blocks.push({
      type: 'text',
      text: `The call connected and you already said: "${input.greeting}"\n\nCaller: "${input.speech || '(no answer / unclear)'}"`,
    });
  } else {
    const earlier = (state.pendingCaller || []).map((t) => `Caller: "${t}"`).join('\n');
    if (earlier) blocks.push({ type: 'text', text: `Earlier, before you could reply, the caller said:\n${earlier}` });
    const cut = input.interruptedAfter
      ? `(The caller cut you off. They heard you say only: "${input.interruptedAfter}")\n\n`
      : '';
    blocks.push({ type: 'text', text: `${cut}Caller: "${input.speech || '(silence or unclear audio)'}"` });
  }
  return { role: 'user', content: blocks };
}

/**
 * Splits the streamed model output into: optional [[lang]] tag, spoken text,
 * and the trailing <<<json>>> metadata. Holds back just enough characters to
 * never speak part of a marker.
 */
export class OutputSplitter {
  private buf = '';
  private phase: 'start' | 'speech' | 'meta' = 'start';
  meta = '';
  spoken = '';
  constructor(
    private emit: (s: string) => void,
    private onTag: (code: string) => void,
  ) {}

  push(delta: string) {
    this.buf += delta;
    this.drain(false);
  }
  end() {
    this.drain(true);
  }

  private drain(final: boolean) {
    if (this.phase === 'start') {
      const t = this.buf.trimStart();
      if (t.startsWith('[[')) {
        const close = t.indexOf(']]');
        if (close === -1) {
          if (!final && t.length < 20) return;
        } else {
          this.onTag(t.slice(2, close).trim());
          this.buf = t.slice(close + 2).trimStart();
        }
      } else if (!final && t.length < 2 && '[['.startsWith(t)) {
        return; // could still be the start of a tag
      } else {
        this.buf = t;
      }
      this.phase = 'speech';
    }
    if (this.phase === 'speech') {
      const at = this.buf.indexOf('<<<');
      if (at !== -1) {
        this.say(this.buf.slice(0, at));
        this.meta = this.buf.slice(at + 3);
        this.buf = '';
        this.phase = 'meta';
        return;
      }
      // Keep a possible partial "<<" at the end until we know.
      const m = final ? null : this.buf.match(/<{1,2}$/);
      const cut = m ? this.buf.length - m[0].length : this.buf.length;
      this.say(this.buf.slice(0, cut));
      this.buf = this.buf.slice(cut);
      return;
    }
    this.meta += this.buf;
    this.buf = '';
  }

  private say(s: string) {
    if (!s) return;
    // Trim leading whitespace at the very start of speech; keep inner spacing.
    const out = this.spoken ? s : s.replace(/^\s+/, '');
    if (!out) return;
    this.spoken += out;
    this.emit(out);
  }
}

interface Meta {
  answers?: Record<string, unknown>;
  action?: string;
  callback_time?: string | null;
  opt_out?: boolean;
}

function parseMeta(raw: string): Meta {
  const s = raw.replace(/>>>[\s\S]*$/, '').trim();
  try {
    const m = JSON.parse(s);
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

/**
 * Run one conversational turn. Mutates `state` (messages, captured answers,
 * language, outcome). On abort (caller interrupted), nothing is appended to
 * the history; the next turn tells the model what the caller actually heard.
 */
export async function runTurn(
  pb: Playbook,
  state: CallState,
  input: TurnInput,
  io: AgentIO & { canTransfer: boolean },
): Promise<AgentReply> {
  const user = userTurn(pb, state, input);
  const messages = [...(state.messages as Msg[]), user];
  const splitter = new OutputSplitter(
    (s) => io.onText?.(s),
    (code) => {
      const lang = findLanguage(pb, code);
      if (lang && lang.code !== state.language) {
        state.language = lang.code;
        io.onLanguage?.(resolveLanguage(pb, lang.code));
      }
    },
  );

  let final: Anthropic.Beta.BetaMessage;
  try {
    const stream = client().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: EFFORT },
        cache_control: { type: 'ephemeral' },
        system: buildSystemPrompt(pb, io.canTransfer),
        messages,
      },
      { signal: io.signal },
    );
    stream.on('text', (delta) => splitter.push(delta));
    final = await stream.finalMessage();
    splitter.end();
  } catch (err) {
    if (io.signal?.aborted) {
      // Nothing goes into history, but keep what the caller said for the next turn.
      if (input.kind !== 'open' && input.speech) state.pendingCaller = [...(state.pendingCaller || []), input.speech];
      return { text: splitter.spoken, action: 'continue', aborted: true };
    }
    if (err instanceof Anthropic.RateLimitError) console.error('callbot: rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`callbot: API error ${err.status}`, err.message);
    else console.error('callbot: turn failed', err);
    // Keep the caller's words in history so the next turn has them.
    state.messages.push(user, { role: 'assistant', content: [{ type: 'text', text: '(connection problem, asked them to repeat)' }] });
    state.pendingCaller = [];
    const line = splitter.spoken ? '' : fallbackLine(state.language);
    if (line) io.onText?.(line);
    return { text: splitter.spoken || line, action: 'continue', aborted: false };
  }

  if (final.stop_reason === 'refusal') {
    console.warn('callbot: refusal', final.stop_details?.category);
    const line = splitter.spoken ? '' : fallbackLine(state.language);
    if (line) io.onText?.(line);
    state.messages.push(user, { role: 'assistant', content: [{ type: 'text', text: line || splitter.spoken }] });
    state.pendingCaller = [];
    return { text: splitter.spoken || line, action: 'continue', aborted: false };
  }

  // Append-only history: the assistant turn goes back exactly as returned.
  state.messages.push(user, { role: 'assistant', content: final.content });
  state.pendingCaller = [];
  state.turns += 1;

  const meta = parseMeta(splitter.meta);
  for (const [k, v] of Object.entries(meta.answers || {})) {
    const nv = normalizeValue(pb, k, v);
    if (nv !== undefined) state.captured[k] = nv;
  }
  if (meta.opt_out) state.optOut = true;
  if (meta.callback_time) state.callbackAt = String(meta.callback_time);

  let action: CallAction = (['continue', 'end', 'callback', 'transfer'] as const).includes(meta.action as CallAction)
    ? (meta.action as CallAction)
    : 'continue';
  if (action === 'transfer' && !io.canTransfer) action = 'continue';
  if (state.optOut) action = 'end';
  // Hard stop so a confused call can't run up minutes.
  if (action === 'continue' && state.turns >= (pb.maxTurns || 14) + 2) action = 'end';
  if (action !== 'continue') state.outcome = action;

  let text = splitter.spoken.trim();
  if (!text) {
    text = fallbackLine(state.language);
    io.onText?.(text);
  }
  return { text, action, aborted: false };
}

export interface CallSummary {
  summary: string;
  nextStep: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'next_step', 'sentiment'],
  properties: {
    summary: { type: 'string', description: '2-4 sentences in English for a salesperson picking up this lead.' },
    next_step: { type: 'string', description: 'The single most useful next action, in English.' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
  },
} as const;

/** Post-call write-up for the sales team, always in English. */
export async function summarizeCall(pb: Playbook, state: CallState): Promise<CallSummary | null> {
  if (!state.transcript.some((t) => t.role === 'prospect')) return null;
  try {
    const response = await client().beta.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: `Summarise this ${pb.company} sales qualification call for the sales team, in English (translate if the call was in another language). Goal was: ${pb.callGoal}
Call language(s): ended in ${state.language}
Captured answers: ${JSON.stringify(state.captured)}
Outcome: ${state.outcome || 'unknown'}${state.callbackAt ? ` (callback requested: ${state.callbackAt})` : ''}

Transcript:
${state.transcript.map((t) => `${t.role === 'bot' ? 'Bot' : 'Prospect'}: ${t.text}`).join('\n')}`,
          },
        ],
      },
      { timeout: 25_000 },
    );
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const p = JSON.parse(text);
    return { summary: p.summary, nextStep: p.next_step, sentiment: p.sentiment };
  } catch (err) {
    console.error('callbot: summary failed', err);
    return null;
  }
}
