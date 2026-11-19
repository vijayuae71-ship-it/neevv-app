import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/callbot/admin';
import { getPlaybook, scoreLead } from '@/lib/callbot/playbook';
import { finalizeCall, markInterrupted, modelOpening, newCallState, prospectTurn, recordGreeting, scriptedGreeting } from '@/lib/callbot/session';
import { upsertLead } from '@/lib/callbot/store';
import type { CallState, LeadInput } from '@/lib/callbot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Text-mode rehearsal of a call, no phone needed. Same engine as real calls.
 * The client keeps the state between requests.
 * POST { playbookId, lead? }                 → starts a call, returns the opening line
 * POST { playbookId, state, message }        → one prospect turn
 * POST { playbookId, state, interrupt: "…" } → caller cut the bot off after hearing "…"
 * POST { playbookId, state, end: true, save? } → score + summary (save also writes the lead)
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const pb = getPlaybook(body.playbookId);
  let state: CallState | undefined = body.state;

  if (!state) {
    const lead: LeadInput = { phone: '+10000000000', name: 'there', source: 'simulator', ...(body.lead || {}) };
    state = newCallState(pb, 'sim_' + randomUUID(), lead, 'simulated', 'simulated');
    const greeting = scriptedGreeting(pb, state);
    let say = greeting;
    if (say) recordGreeting(state, say);
    else say = (await modelOpening(pb, state)).text;
    return NextResponse.json({ state, say, action: 'continue', result: scoreLead(pb, state) });
  }
  state.playbookId = pb.id;

  if (body.end) {
    const { result, summary } = await finalizeCall(pb, state);
    if (body.save) await upsertLead(state, result, summary).catch((e) => console.error('callbot sim save', e));
    return NextResponse.json({ state, result, summary });
  }

  const interruptedAfter = typeof body.interrupt === 'string' ? body.interrupt : undefined;
  if (interruptedAfter !== undefined) markInterrupted(state, interruptedAfter);
  const turn = await prospectTurn(pb, state, String(body.message || ''), {}, interruptedAfter);
  return NextResponse.json({ state, say: turn.text, action: turn.action, result: scoreLead(pb, state) });
}
