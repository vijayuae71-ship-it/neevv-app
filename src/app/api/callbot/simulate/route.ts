import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/callbot/admin';
import { getPlaybook, scoreLead } from '@/lib/callbot/playbook';
import { finalizeCall, handleProspectTurn, newCallState, openingLine } from '@/lib/callbot/session';
import { upsertLead } from '@/lib/callbot/store';
import type { CallState, LeadInput } from '@/lib/callbot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Text-mode rehearsal of a call, no phone needed. The client keeps the state.
 * POST { playbookId, lead?, state?, message?, end?, save? }
 *  - no state  → starts a call, returns the opening line
 *  - message   → one prospect turn
 *  - end: true → score + summary (save: true also writes the lead to Firestore)
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const pb = getPlaybook(body.playbookId);
  let state: CallState | undefined = body.state;

  if (!state) {
    const lead: LeadInput = { phone: '+10000000000', name: 'there', source: 'simulator', ...(body.lead || {}) };
    state = newCallState(pb, 'sim_' + randomUUID(), lead, 'simulated');
    const say = openingLine(pb, state);
    return NextResponse.json({ state, say, action: 'continue', result: scoreLead(pb, state) });
  }
  state.playbookId = pb.id;

  if (body.end) {
    const { result, summary } = await finalizeCall(pb, state);
    if (body.save) await upsertLead(state, result, summary).catch((e) => console.error('callbot sim save', e));
    return NextResponse.json({ state, result, summary });
  }

  const turn = await handleProspectTurn(pb, state, String(body.message || ''));
  return NextResponse.json({ state, say: turn.say, action: turn.action, result: scoreLead(pb, state) });
}
