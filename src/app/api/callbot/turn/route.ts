import { getPlaybook } from '@/lib/callbot/playbook';
import { addDoNotCall, getCall, saveCall } from '@/lib/callbot/store';
import { prospectTurn, transferNumber } from '@/lib/callbot/session';
import { dialTwiml, readTwilioRequest, sayAndGather, sayAndHangup, twiml, twimlResponse } from '@/lib/callbot/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Basic mode only: Twilio <Gather> action with the prospect's words (SpeechResult). */
export async function POST(req: Request) {
  const parsed = await readTwilioRequest(req);
  if (!parsed.ok) return new Response('Invalid signature', { status: 403 });
  const p = parsed.params;

  const ref = new URL(req.url).searchParams.get('ref');
  const state = ref ? await getCall(ref) : null;
  if (!state) return twimlResponse(twiml('<Say>Sorry, something went wrong. Goodbye.</Say><Hangup/>'));

  const pb = getPlaybook(state.playbookId);
  const turn = await prospectTurn(pb, state, p.SpeechResult || '');
  await saveCall(state);
  if (state.optOut) await addDoNotCall(state.lead.phone, 'Asked on call').catch(console.error);

  const lang = state.language;
  const xfer = transferNumber(pb);
  switch (turn.action) {
    case 'transfer':
      return twimlResponse(xfer ? dialTwiml(pb, lang, xfer, turn.text) : sayAndHangup(pb, lang, turn.text));
    case 'end':
    case 'callback':
      return twimlResponse(sayAndHangup(pb, lang, turn.text));
    default:
      return twimlResponse(sayAndGather(pb, lang, turn.text, `/api/callbot/turn?ref=${encodeURIComponent(state.callSid)}`));
  }
}
