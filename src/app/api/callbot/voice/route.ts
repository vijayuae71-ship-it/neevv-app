import { randomUUID } from 'crypto';
import { getPlaybook } from '@/lib/callbot/playbook';
import { getCall, saveCall } from '@/lib/callbot/store';
import { newCallState, openingLine } from '@/lib/callbot/session';
import { readTwilioRequest, sayAndGather, twiml, twimlResponse } from '@/lib/callbot/twilio';

export const dynamic = 'force-dynamic';

/**
 * Twilio "call answered" webhook.
 * - Outbound calls arrive with ?ref=<our call id> (state was saved before dialing).
 * - Inbound calls: point your Twilio number's Voice webhook at
 *   /api/callbot/voice?playbook=<playbook-id>
 */
export async function POST(req: Request) {
  const parsed = await readTwilioRequest(req);
  if (!parsed.ok) return new Response('Invalid signature', { status: 403 });
  const p = parsed.params;
  const url = new URL(req.url);

  // Answering machine on an outbound call: hang up without pitching.
  if (p.AnsweredBy && p.AnsweredBy.startsWith('machine')) {
    return twimlResponse(twiml('<Hangup/>'));
  }

  const ref = url.searchParams.get('ref');
  let state = ref ? await getCall(ref) : null;

  if (!state) {
    // Inbound: the prospect called us, so a do-not-call entry doesn't apply.
    const caller = p.From || 'unknown';
    const pb = getPlaybook(url.searchParams.get('playbook'));
    state = newCallState(pb, ref || p.CallSid || randomUUID(), { phone: caller, source: 'inbound' }, 'inbound');
  }

  const pb = getPlaybook(state.playbookId);
  state.twilioSid = p.CallSid || state.twilioSid;
  const text = openingLine(pb, state);
  await saveCall(state);

  return twimlResponse(sayAndGather(pb, text, `/api/callbot/turn?ref=${encodeURIComponent(state.callSid)}`));
}
