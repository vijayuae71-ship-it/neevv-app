import { createHmac, timingSafeEqual } from 'crypto';
import type { Playbook } from './types';

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

export function say(pb: Playbook, text: string): string {
  return `<Say voice="${esc(pb.voice.name)}" language="${esc(pb.voice.language)}">${esc(text)}</Say>`;
}

/** Speak, then listen for the prospect's reply and post it to the turn webhook. */
export function sayAndGather(pb: Playbook, text: string, actionPath: string): string {
  const action = esc(publicBaseUrl() + actionPath);
  return twiml(
    `<Gather input="speech" action="${action}" method="POST" language="${esc(pb.voice.language)}" ` +
      `speechTimeout="auto" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true">` +
      say(pb, text) +
      `</Gather>` +
      // Only reached if Gather fails outright; empty speech still goes to the action.
      `<Redirect method="POST">${action}</Redirect>`,
  );
}

export function sayAndHangup(pb: Playbook, text: string): string {
  return twiml(say(pb, text) + '<Hangup/>');
}

export function sayAndDial(pb: Playbook, text: string, number: string): string {
  return twiml(say(pb, text) + `<Dial timeout="25">${esc(number)}</Dial>` + say(pb, "Sorry, no one could pick up. We'll call you back shortly. Goodbye!") + '<Hangup/>');
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
