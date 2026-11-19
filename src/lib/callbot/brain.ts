import Anthropic from '@anthropic-ai/sdk';
import type { CallAction, CallState, Playbook } from './types';
import { normalizeValue, scoreLead } from './playbook';

// Each phone turn has to answer inside Twilio's 15 s webhook limit, so keep the
// model on low effort with a tight client timeout. Both are env-tunable.
const MODEL = process.env.CALLBOT_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.CALLBOT_EFFORT || 'low') as 'low' | 'medium' | 'high';

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ timeout: 11_000, maxRetries: 1 });
  return _client;
}

export interface TurnDecision {
  say: string;
  captured: Record<string, string | number | boolean>;
  action: CallAction;
  callbackAt?: string;
  optOut: boolean;
}

const TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'captured', 'action', 'callback_time', 'opt_out'],
  properties: {
    say: { type: 'string', description: 'Exactly what to say next, spoken aloud. 1-3 short sentences.' },
    captured: {
      type: 'array',
      description: 'Qualification answers learned from the latest reply (or corrections). Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value'],
        properties: { key: { type: 'string' }, value: { type: 'string' } },
      },
    },
    action: { type: 'string', enum: ['continue', 'end', 'transfer', 'callback'] },
    callback_time: {
      type: ['string', 'null'],
      description: 'When action is callback: the time the prospect asked for, as they said it.',
    },
    opt_out: { type: 'boolean', description: 'True if the prospect asked not to be called again.' },
  },
} as const;

function describeField(f: Playbook['fields'][number]): string {
  let line = `- ${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.question}`;
  if (f.options) line += ` Allowed values: ${f.options.map((o) => `"${o.value}" = ${o.label}`).join('; ')}.`;
  if (f.type === 'boolean') line += ' Value "true" or "false".';
  if (f.type === 'number') line += ' Value as a plain number.';
  if (f.hint) line += ` Note: ${f.hint}`;
  return line;
}

/** Stable per playbook, so it is prompt-cached across turns and calls. */
export function buildSystemPrompt(pb: Playbook, canTransfer: boolean): string {
  const objections = Object.entries(pb.objections || {})
    .map(([o, r]) => `- "${o}" → ${r}`)
    .join('\n');
  return `You are ${pb.agentName}, a friendly, concise sales development rep for ${pb.company}, speaking on a live phone call. Everything you write in "say" is converted to speech, so write the way people talk: short sentences, no lists, no markdown, no emojis, no URLs read out character by character. Ask one question at a time.

About ${pb.company}:
${pb.product}

Selling points you may use (do not invent others, and never make claims beyond these):
${pb.valueProps.map((v) => `- ${v}`).join('\n')}

Goal of the call: ${pb.callGoal}

Information to learn, in roughly this order, woven naturally into the conversation. Skip anything already known.
${pb.fields.map(describeField).join('\n')}

Approved responses to common objections:
${objections || '- (none)'}

How to run the call:
- Briefly acknowledge what the prospect said before your next question. React to it; don't sound scripted.
- Record every answer you learn in "captured", using only the keys above. For choice fields use one of the allowed values exactly; if the answer doesn't clearly fit, ask a short follow-up instead of guessing.
- If the prospect is busy, offer a callback and use action "callback" with the time they gave.
- If they ask not to be called again, apologise, confirm they won't be called, set opt_out true and action "end".
- If they are clearly not a fit, thank them politely and end.
- Once the required items are known, move to the goal: ${pb.callGoal}${canTransfer ? ' If the lead is strong and agrees to speak to a person now, use action "transfer" and say you are connecting them.' : ''}
- When the call is done, say a warm goodbye in "say" and use action "end".
- If you didn't catch what they said (empty or garbled text), politely ask them to repeat.
- Never pressure, never lie, never claim to be human. If asked, say you are an AI assistant for ${pb.company}.
- Never collect card numbers, bank details, passwords or ID numbers.
${(pb.rules || []).map((r) => `- ${r}`).join('\n')}`;
}

function buildTurnMessage(pb: Playbook, state: CallState, latest: string): string {
  const score = scoreLead(pb, state);
  const transcript = state.transcript
    .map((t) => `${t.role === 'bot' ? pb.agentName : 'Prospect'}: ${t.text}`)
    .join('\n');
  const max = pb.maxTurns || 14;
  return `Prospect name: ${state.lead.name || 'unknown'}
Already known before the call: ${JSON.stringify(state.lead.known || {})}
Notes: ${state.lead.notes || 'none'}
Captured so far: ${JSON.stringify(state.captured)}
Still missing (required): ${score.missingRequired.join(', ') || 'none'}
Turn ${state.turns + 1} of at most ${max}.${state.turns + 1 >= max ? ' This is the last turn: wrap up now and end the call.' : ''}

Conversation so far:
${transcript}

Prospect just said: "${latest || '(silence / not understood)'}"

Decide your next line.`;
}

const FALLBACK_LINE = "Sorry, I didn't quite catch that. Could you say that again?";

export async function decideNextTurn(
  pb: Playbook,
  state: CallState,
  latest: string,
  canTransfer: boolean,
): Promise<TurnDecision> {
  try {
    const response = await client().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: TURN_SCHEMA } },
      system: [{ type: 'text', text: buildSystemPrompt(pb, canTransfer), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildTurnMessage(pb, state, latest) }],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.warn('callbot: unusable model turn', response.stop_reason);
      return { say: FALLBACK_LINE, captured: {}, action: 'continue', optOut: false };
    }

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = JSON.parse(text) as {
      say: string;
      captured: { key: string; value: string }[];
      action: CallAction;
      callback_time: string | null;
      opt_out: boolean;
    };

    const captured: TurnDecision['captured'] = {};
    for (const { key, value } of parsed.captured || []) {
      const v = normalizeValue(pb, key, value);
      if (v !== undefined) captured[key] = v;
    }
    const action: CallAction = ['continue', 'end', 'transfer', 'callback'].includes(parsed.action)
      ? parsed.action
      : 'continue';

    return {
      say: (parsed.say || FALLBACK_LINE).trim(),
      captured,
      action: action === 'transfer' && !canTransfer ? 'continue' : action,
      callbackAt: parsed.callback_time || undefined,
      optOut: !!parsed.opt_out,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error('callbot: rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`callbot: API error ${err.status}`, err.message);
    else console.error('callbot: turn failed', err);
    return { say: FALLBACK_LINE, captured: {}, action: 'continue', optOut: false };
  }
}

export interface CallSummary {
  summary: string;
  nextStep: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'next_step', 'sentiment'],
  properties: {
    summary: { type: 'string', description: '2-4 sentences for a salesperson picking up this lead.' },
    next_step: { type: 'string', description: 'The single most useful next action.' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
  },
} as const;

/** Post-call write-up for the sales team. Not time-critical. */
export async function summarizeCall(pb: Playbook, state: CallState): Promise<CallSummary | null> {
  if (!state.transcript.some((t) => t.role === 'prospect')) return null;
  try {
    const response = await client().beta.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: `Summarise this ${pb.company} sales qualification call for the sales team. Goal was: ${pb.callGoal}
Captured answers: ${JSON.stringify(state.captured)}
Outcome: ${state.outcome || 'unknown'}${state.callbackAt ? ` (callback requested: ${state.callbackAt})` : ''}

Transcript:
${state.transcript.map((t) => `${t.role === 'bot' ? 'Bot' : 'Prospect'}: ${t.text}`).join('\n')}`,
          },
        ],
      },
      { timeout: 60_000 },
    );
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const p = JSON.parse(text);
    return { summary: p.summary, nextStep: p.next_step, sentiment: p.sentiment };
  } catch (err) {
    console.error('callbot: summary failed', err);
    return null;
  }
}
