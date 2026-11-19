import { getPlaybook } from '@/lib/callbot/playbook';
import { getCall, saveCall, upsertLead } from '@/lib/callbot/store';
import { finalizeCall } from '@/lib/callbot/session';
import { readTwilioRequest } from '@/lib/callbot/twilio';
import type { CallState } from '@/lib/callbot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FINAL: Record<string, CallState['status']> = {
  completed: 'completed',
  'no-answer': 'no_answer',
  busy: 'no_answer',
  failed: 'failed',
  canceled: 'failed',
};

/** Twilio status callback: when the call ends, score the lead and write the summary. */
export async function POST(req: Request) {
  const parsed = await readTwilioRequest(req);
  if (!parsed.ok) return new Response('Invalid signature', { status: 403 });
  const p = parsed.params;

  const finalStatus = FINAL[p.CallStatus];
  if (!finalStatus) return new Response(null, { status: 204 });

  const ref = new URL(req.url).searchParams.get('ref') || p.CallSid;
  const state = ref ? await getCall(ref) : null;
  if (!state || state.status !== 'in_progress') return new Response(null, { status: 204 });

  const pb = getPlaybook(state.playbookId);
  // Answered by a machine or never answered: no conversation happened.
  const talked = state.transcript.some((t) => t.role === 'prospect');
  const status = finalStatus === 'completed' && !talked ? 'no_answer' : finalStatus;
  if (status !== 'completed') state.outcome = 'callback';

  const { result, summary } = await finalizeCall(pb, state, status);
  await saveCall(state);
  await upsertLead(state, result, summary);
  return new Response(null, { status: 204 });
}
