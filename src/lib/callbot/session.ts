import type { CallState, LeadInput, LeadResult, Playbook } from './types';
import { findLanguage, openingFor, scoreLead } from './playbook';
import { runTurn, summarizeCall, type AgentIO, type CallSummary } from './agent';
import { leadIdFor } from './store';

// Call lifecycle shared by every transport (streaming relay, basic webhooks, simulator).

export function transferNumber(pb: Playbook): string | undefined {
  return process.env.CALLBOT_TRANSFER_NUMBER || pb.transferNumber || undefined;
}

export function newCallState(
  pb: Playbook,
  callSid: string,
  lead: LeadInput,
  direction: CallState['direction'],
  channel: CallState['channel'],
): CallState {
  const language = findLanguage(pb, lead.language)?.code || pb.defaultLanguage;
  return {
    callSid,
    playbookId: pb.id,
    leadId: leadIdFor(lead.phone),
    lead,
    direction,
    channel,
    status: 'in_progress',
    language,
    messages: [],
    transcript: [],
    captured: {},
    turns: 0,
    silentTurns: 0,
    startedAt: new Date().toISOString(),
  };
}

/** The scripted greeting for the call's language, if one exists. */
export function scriptedGreeting(pb: Playbook, state: CallState): string | undefined {
  return openingFor(pb, state.language, state.lead.name);
}

function botSaid(state: CallState, text: string) {
  if (text.trim()) state.transcript.push({ role: 'bot', text: text.trim(), at: new Date().toISOString() });
}

/** Let the model open the call (used when no scripted greeting exists for the language). */
export async function modelOpening(pb: Playbook, state: CallState, io: AgentIO = {}) {
  const r = await runTurn(pb, state, { kind: 'open' }, { ...io, canTransfer: !!transferNumber(pb) });
  if (!r.aborted) botSaid(state, r.text);
  return r;
}

/** Record that the scripted greeting was spoken. */
export function recordGreeting(state: CallState, greeting: string) {
  botSaid(state, greeting);
}

/**
 * Feed in what the caller said; stream the bot's reply through `io`.
 * `interruptedAfter` is what the caller actually heard of the previous reply
 * when they cut in (from ConversationRelay's interrupt message).
 */
export async function prospectTurn(
  pb: Playbook,
  state: CallState,
  speech: string,
  io: AgentIO = {},
  interruptedAfter?: string,
) {
  const text = (speech || '').trim();
  const now = new Date().toISOString();
  if (text) {
    state.transcript.push({ role: 'prospect', text, at: now });
    state.silentTurns = 0;
  } else {
    state.silentTurns += 1;
    // The model is told about silence and normally says goodbye itself; this is the backstop.
    if (state.silentTurns >= 4) {
      state.outcome = 'callback';
      return { text: '', action: 'end' as const, aborted: false };
    }
  }

  // The first reply after a scripted greeting tells the model what it already said.
  const greeted = state.messages.length === 0 && state.transcript.find((t) => t.role === 'bot');
  const r = await runTurn(
    pb,
    state,
    greeted ? { kind: 'opened', greeting: greeted.text, speech: text } : { kind: 'speech', speech: text, interruptedAfter },
    { ...io, canTransfer: !!transferNumber(pb) },
  );
  if (!r.aborted) botSaid(state, r.text);
  return r;
}

/** Replace the last bot line with what the caller actually heard before cutting in. */
export function markInterrupted(state: CallState, heard: string) {
  const last = state.transcript[state.transcript.length - 1];
  if (last?.role === 'bot') last.text = heard.trim() ? `${heard.trim()} [interrupted]` : '[interrupted]';
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
