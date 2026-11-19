import { createHmac, timingSafeEqual } from 'crypto';
import type { CallState, Playbook, VoiceLanguage } from './types';
import { resolveLanguage } from './playbook';

// Minimal Twilio helpers over plain HTTPS: no SDK dependency needed.

export function publicBaseUrl(): string {
  const url = process.env.CALLBOT_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error('Set CALLBOT_PUBLIC_URL to the public https URL of this app');
  return url.replace(/\/$/, '');
}

/**
 * Verify X-Twilio-Signature. Cloud Run rewrites the host, so the signed URL is
 * rebuilt from CALLBOT_PUBLIC_URL + the request path and query.
 */
export function verifyTwilioSignature(
  pathAndQuery: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  if (!signature) return false;
  const url = publicBaseUrl() + pathAndQuery;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Check X-Twilio-Signature on a request with no body params (e.g. the relay WebSocket upgrade). */
export function verifySignatureForUrl(fullUrl: string, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const expected = createHmac('sha1', token).update(Buffer.from(fullUrl, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parse Twilio's form-encoded webhook body and check its signature. */
export async function readTwilioRequest(
  req: Request,
): Promise<{ ok: true; params: Record<string, string> } | { ok: false }> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });
  const u = new URL(req.url);
  if (process.env.CALLBOT_SKIP_SIGNATURE === 'true' && process.env.NODE_ENV !== 'production') {
    return { ok: true, params };
  }
  const ok = verifyTwilioSignature(u.pathname + u.search, params, req.headers.get('x-twilio-signature'));
  return ok ? { ok: true, params } : { ok: false };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// ---- Streaming mode: Twilio ConversationRelay ----------------------------------
// Twilio handles speech recognition and neural text-to-speech; our WebSocket
// server (callbot-relay/) receives the caller's words and streams replies back.

function langAttrs(l: VoiceLanguage, prefix = ''): string {
  const a: [string, string | undefined][] = [
    ['ttsProvider', l.ttsProvider],
    ['voice', l.voice],
    ['transcriptionProvider', l.transcriptionProvider],
    ['speechModel', l.speechModel],
  ];
  return a
    .filter(([, v]) => v)
    .map(([k, v]) => ` ${prefix}${k}="${esc(v!)}"`)
    .join('');
}

/**
 * <Connect><ConversationRelay>. One <Language> per playbook language so the
 * relay can switch voice + recognition mid-call.
 */
export function conversationRelayTwiml(
  pb: Playbook,
  state: CallState,
  opts: { relayUrl: string; greeting?: string; actionPath: string },
): string {
  const cur = resolveLanguage(pb, state.language);
  const stt = cur.transcriptionLanguage || cur.code;
  const languages = pb.languages
    .map((l) => resolveLanguage(pb, l.code))
    .map((l) => `<Language code="${esc(l.code)}"${langAttrs(l)}/>`)
    .join('');
  const greeting = opts.greeting
    ? ` welcomeGreeting="${esc(opts.greeting)}" welcomeGreetingInterruptible="any"`
    : '';
  return twiml(
    `<Connect action="${esc(publicBaseUrl() + opts.actionPath)}">` +
      `<ConversationRelay url="${esc(opts.relayUrl)}" language="${esc(cur.code)}" ttsLanguage="${esc(cur.code)}" ` +
      `transcriptionLanguage="${esc(stt)}"${langAttrs(cur)}${greeting} interruptible="any" dtmfDetection="true" ` +
      `elevenlabsTextNormalization="on">` +
      languages +
      `<Parameter name="ref" value="${esc(state.callSid)}"/>` +
      `</ConversationRelay></Connect>`,
  );
}

// ---- Basic mode: <Gather> speech webhooks (fallback when no relay is deployed) ----

export function say(pb: Playbook, code: string, text: string): string {
  const l = resolveLanguage(pb, code);
  const voice = l.sayVoice || 'Polly.Joanna-Neural';
  return `<Say voice="${esc(voice)}" language="${esc(l.code)}">${esc(text)}</Say>`;
}

/** Speak, then listen for the prospect's reply and post it to the turn webhook. */
export function sayAndGather(pb: Playbook, code: string, text: string, actionPath: string): string {
  const action = esc(publicBaseUrl() + actionPath);
  return twiml(
    `<Gather input="speech" action="${action}" method="POST" language="${esc(resolveLanguage(pb, code).code)}" ` +
      `speechTimeout="auto" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true">` +
      say(pb, code, text) +
      `</Gather>` +
      `<Redirect method="POST">${action}</Redirect>`,
  );
}

export function sayAndHangup(pb: Playbook, code: string, text: string): string {
  return twiml((text ? say(pb, code, text) : '') + '<Hangup/>');
}

export function dialTwiml(pb: Playbook, code: string, number: string, intro?: string): string {
  return twiml(
    (intro ? say(pb, code, intro) : '') +
      `<Dial timeout="25">${esc(number)}</Dial>` +
      say(pb, code, "Sorry, no one could pick up just now. We'll call you back shortly. Goodbye!") +
      '<Hangup/>',
  );
}

export function twiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

/** Place an outbound call. Twilio fetches voicePath when the call is answered. */
export async function createOutboundCall(opts: {
  to: string;
  voicePath: string;
  statusPath: string;
  record?: boolean;
}): Promise<{ sid: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER must be set');

  const body = new URLSearchParams({
    To: opts.to,
    From: from,
    Url: publicBaseUrl() + opts.voicePath,
    Method: 'POST',
    StatusCallback: publicBaseUrl() + opts.statusPath,
    StatusCallbackMethod: 'POST',
    // Don't let the bot pitch an answering machine.
    MachineDetection: 'Enable',
    Timeout: '30',
  });
  for (const ev of ['answered', 'completed']) body.append('StatusCallbackEvent', ev);
  if (opts.record) body.set('Record', 'true');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message || 'call failed'}`);
  return { sid: json.sid };
}

/** Basic E.164 check: + then 8-15 digits. */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
