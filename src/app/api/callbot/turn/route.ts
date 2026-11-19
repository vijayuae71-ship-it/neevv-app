import { getPlaybook } from '@/lib/callbot/playbook';
import { addDoNotCall, getCall, saveCall } from '@/lib/callbot/store';
import { handleProspectTurn, transferNumber } from '@/lib/callbot/session';
import { readTwilioRequest, sayAndDial, sayAndGather, sayAndHangup, twiml, twimlResponse } from '@/lib/callbot/twilio';

export const dynamic = 'force-dynamic';

/** Twilio <Gather> action: the prospect finished speaking (SpeechResult). */
export async function POST(req: Request) {
  const parsed = await readTwilioRequest(req);
  if (!parsed.ok) return new Response('Invalid signature', { status: 403 });
  const p = parsed.params;

  const ref = new URL(req.url).searchParams.get('ref');
  const state = ref ? await getCall(ref) : null;
  if (!state) return twimlResponse(twiml('<Say>Sorry, something went wrong. Goodbye.</Say><Hangup/>'));

  const pb = getPlaybook(state.playbookId);
  const turn = await handleProspectTurn(pb, state, p.SpeechResult || '');
  await saveCall(state);
  if (state.optOut) await addDoNotCall(state.lead.phone, 'Asked on call').catch(console.error);

  const next = `/api/callbot/turn?ref=${encodeURIComponent(state.callSid)}`;
  const xfer = transferNumber(pb);
  switch (turn.action) {
    case 'transfer':
      return twimlResponse(xfer ? sayAndDial(pb, turn.say, xfer) : sayAndHangup(pb, turn.say));
    case 'end':
    case 'callback':
      return twimlResponse(sayAndHangup(pb, turn.say));
    default:
      return twimlResponse(sayAndGather(pb, turn.say, next));
  }
}
