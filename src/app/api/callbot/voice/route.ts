import { randomUUID } from 'crypto';
import { getPlaybook } from '@/lib/callbot/playbook';
import { getCall, saveCall } from '@/lib/callbot/store';
import { modelOpening, newCallState, recordGreeting, scriptedGreeting } from '@/lib/callbot/session';
import { conversationRelayTwiml, readTwilioRequest, sayAndGather, twiml, twimlResponse } from '@/lib/callbot/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Twilio "call answered" webhook.
 * - Outbound calls arrive with ?ref=<our call id> (state was saved before dialing).
 * - Inbound calls: set your Twilio number's Voice webhook to
 *   /api/callbot/voice?playbook=<playbook-id>
 *
 * With CALLBOT_RELAY_URL set, the call runs in streaming mode (ConversationRelay:
 * natural voices, barge-in, mid-call language switching). Without it, a basic
 * <Gather>/<Say> turn-by-turn mode is used.
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

  const relayUrl = process.env.CALLBOT_RELAY_URL;
  const ref = url.searchParams.get('ref');
  let state = ref ? await getCall(ref) : null;
  if (!state) {
    // Inbound: the prospect called us, so a do-not-call entry doesn't apply.
    const pb = getPlaybook(url.searchParams.get('playbook'));
    state = newCallState(
      pb,
      ref || p.CallSid || randomUUID(),
      { phone: p.From || 'unknown', source: 'inbound' },
      'inbound',
      relayUrl ? 'relay' : 'gather',
    );
  }
  const pb = getPlaybook(state.playbookId);
  state.twilioSid = p.CallSid || state.twilioSid;
  state.channel = relayUrl ? 'relay' : 'gather';

  const greeting = scriptedGreeting(pb, state);

  if (relayUrl) {
    if (greeting) recordGreeting(state, greeting);
    await saveCall(state);
    return twimlResponse(
      conversationRelayTwiml(pb, state, {
        relayUrl,
        greeting,
        actionPath: `/api/callbot/handoff?ref=${encodeURIComponent(state.callSid)}`,
      }),
    );
  }

  let text = greeting;
  if (text) recordGreeting(state, text);
  else text = (await modelOpening(pb, state)).text;
  await saveCall(state);
  return twimlResponse(sayAndGather(pb, state.language, text, `/api/callbot/turn?ref=${encodeURIComponent(state.callSid)}`));
}
