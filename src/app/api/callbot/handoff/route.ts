import { getPlaybook } from '@/lib/callbot/playbook';
import { getCall } from '@/lib/callbot/store';
import { transferNumber } from '@/lib/callbot/session';
import { dialTwiml, readTwilioRequest, twiml, twimlResponse } from '@/lib/callbot/twilio';

export const dynamic = 'force-dynamic';

/**
 * <Connect action> callback: Twilio calls this when the ConversationRelay
 * session ends. HandoffData is what the relay sent with its "end" message.
 * Transfer → dial the human; anything else → hang up.
 */
export async function POST(req: Request) {
  const parsed = await readTwilioRequest(req);
  if (!parsed.ok) return new Response('Invalid signature', { status: 403 });
  let data: { action?: string; language?: string } = {};
  try {
    data = JSON.parse(parsed.params.HandoffData || '{}');
  } catch {
    /* no handoff data: caller hung up or session errored */
  }

  if (data.action === 'transfer') {
    const ref = new URL(req.url).searchParams.get('ref');
    const state = ref ? await getCall(ref) : null;
    const pb = getPlaybook(state?.playbookId);
    const number = transferNumber(pb);
    if (number) return twimlResponse(dialTwiml(pb, data.language || state?.language || pb.defaultLanguage, number));
  }
  return twimlResponse(twiml('<Hangup/>'));
}
