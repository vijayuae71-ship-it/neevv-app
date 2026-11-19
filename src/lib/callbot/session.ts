import type { CallState, LeadInput, LeadResult, Playbook } from './types';
import { fillTemplate, scoreLead } from './playbook';
import { decideNextTurn, summarizeCall, type CallSummary } from './brain';
import { leadIdFor } from './store';

// Transport-agnostic call logic, shared by the Twilio webhooks and the text simulator.

export function transferNumber(pb: Playbook): string | undefined {
  return process.env.CALLBOT_TRANSFER_NUMBER || pb.transferNumber || undefined;
}

export function newCallState(
  pb: Playbook,
  callSid: string,
  lead: LeadInput,
  direction: CallState['direction'],
): CallState {
  return {
    callSid,
    playbookId: pb.id,
    leadId: leadIdFor(lead.phone),
    lead,
    direction,
    status: 'in_progress',
    transcript: [],
    captured: {},
    turns: 0,
    silentTurns: 0,
    startedAt: new Date().toISOString(),
  };
}

/** First thing the bot says: disclosure + opening line. */
export function openingLine(pb: Playbook, state: CallState): string {
  const text = `${fillTemplate(pb.opening, pb, state.lead.name)} ${pb.disclosure}`.trim();
  state.transcript.push({ role: 'bot', text, at: new Date().toISOString() });
  return text;
}

export interface TurnResult {
  say: string;
  action: 'continue' | 'end' | 'transfer' | 'callback';
}

/** Feed the prospect's latest words in; get the bot's reply and what to do next. */
export async function handleProspectTurn(pb: Playbook, state: CallState, speech: string): Promise<TurnResult> {
  const text = (speech || '').trim();
  const now = new Date().toISOString();

  if (text) {
    state.transcript.push({ role: 'prospect', text, at: now });
    state.silentTurns = 0;
  } else {
    state.silentTurns += 1;
    if (state.silentTurns >= 3) {
      const bye = "I'm having trouble hearing you, so I'll try you another time. Goodbye!";
      state.transcript.push({ role: 'bot', text: bye, at: now });
      state.outcome = 'callback';
      return { say: bye, action: 'end' };
    }
  }

  const decision = await decideNextTurn(pb, state, text, !!transferNumber(pb));
  state.turns += 1;
  Object.assign(state.captured, decision.captured);
  if (decision.optOut) state.optOut = true;
  if (decision.callbackAt) state.callbackAt = decision.callbackAt;

  let action = decision.action;
  // Hard stop so a confused call can't run up minutes.
  if (action === 'continue' && state.turns >= (pb.maxTurns || 14) + 2) action = 'end';

  state.transcript.push({ role: 'bot', text: decision.say, at: new Date().toISOString() });
  if (action !== 'continue') state.outcome = action;
  return { say: decision.say, action };
}

export async function finalizeCall(
  pb: Playbook,
  state: CallState,
  status: CallState['status'] = 'completed',
): Promise<{ result: LeadResult; summary: CallSummary | null }> {
  state.status = status;
  state.endedAt = state.endedAt || new Date().toISOString();
  if (!state.outcome) state.outcome = 'end';
  const result = scoreLead(pb, state);
  const summary = await summarizeCall(pb, state);
  return { result, summary };
}
