// Types for the sales & lead-qualification calling bot.
// A "playbook" is the whole sales script as data: who we are, what we sell,
// what we must learn from the prospect, and how answers turn into a lead score.

export type FieldType = 'text' | 'number' | 'boolean' | 'choice';

export interface ChoiceOption {
  /** Canonical value stored on the lead, e.g. "0-3_months". */
  value: string;
  /** How a human would describe it; helps the model map free speech to the option. */
  label: string;
  /** 0..1 — how good this answer is for qualification. */
  points: number;
}

export interface QualificationField {
  key: string;
  /** What the bot is trying to learn, phrased as a natural question. */
  question: string;
  type: FieldType;
  required?: boolean;
  /** Relative importance in the final score. 0 = captured but not scored. */
  weight: number;
  options?: ChoiceOption[];
  /** number fields: answers >= this score full points, below scale linearly. */
  idealMin?: number;
  /** boolean fields: which answer is the good one (default true). */
  idealValue?: boolean;
  /** Extra guidance for the bot, e.g. "ask in AED; accept ranges". */
  hint?: string;
}

/**
 * Voice + speech-recognition setup for one language. Provider/voice/model
 * values are passed straight to Twilio ConversationRelay, so any voice Twilio
 * supports can be used without code changes.
 */
export interface VoiceLanguage {
  /** BCP-47 code, e.g. "hi-IN", "ar-AE". */
  code: string;
  /** Human name the model sees, e.g. "Hindi". */
  name: string;
  ttsProvider?: 'ElevenLabs' | 'Google' | 'Amazon';
  /** Provider voice id. ElevenLabs format: "<voiceId>-<model>-<speed>_<stability>_<similarity>". */
  voice?: string;
  transcriptionProvider?: 'Deepgram' | 'Google';
  /** Override the recognition language, e.g. "multi" for Deepgram's mixed English/Hindi. */
  transcriptionLanguage?: string;
  /** e.g. "nova-3-general" (Deepgram) or "telephony" (Google). */
  speechModel?: string;
  /** Voice for the basic <Gather>/<Say> fallback mode, e.g. "Google.hi-IN-Neural2-A". */
  sayVoice?: string;
  /** Short natural sounds used if a reply takes a moment, e.g. "Hmm, okay…". */
  fillers?: string[];
  /** Extra guidance for this language, e.g. "Mix in English words as Indians naturally do". */
  style?: string;
}

export interface Disqualifier {
  /** Field key and the values that immediately disqualify the lead. */
  field: string;
  values: (string | number | boolean)[];
  reason: string;
}

export interface Playbook {
  id: string;
  name: string;
  company: string;
  /** The name the bot introduces itself with. */
  agentName: string;
  /** Short product pitch the bot can draw on. Keep it factual. */
  product: string;
  /** Concrete selling points the bot may mention. Nothing outside this list. */
  valueProps: string[];
  /** What a successful call ends with, e.g. "book a 20-minute demo". */
  callGoal: string;
  /** Call opening. {name}, {agent} and {company} are filled in. */
  opening: string;
  /** Read once at the start, before anything else (recording/AI disclosure). */
  disclosure: string;
  /** Optional opening + disclosure written for other languages, keyed by code. Otherwise the model writes it. */
  openingByLanguage?: Record<string, string>;
  fields: QualificationField[];
  disqualifiers?: Disqualifier[];
  /** Objection → approved response. */
  objections?: Record<string, string>;
  /** Score cut-offs (0..100). */
  tiers: { hot: number; warm: number };
  /** Optional human to hand hot leads to (E.164). Overridden by CALLBOT_TRANSFER_NUMBER. */
  transferNumber?: string;
  /** How the agent sounds and behaves as a person, e.g. "warm, upbeat, from Bengaluru". */
  persona?: string;
  /** Language the call opens in (a code from `languages`). Leads can override with `language`. */
  defaultLanguage: string;
  /** Languages the bot may switch to mid-call. The first matching code wins. */
  languages: VoiceLanguage[];
  /** Local calling window for outbound calls. */
  callingHours?: { timezone: string; start: string; end: string; days?: number[] };
  /** Hard cap on back-and-forth turns before the bot wraps up. */
  maxTurns?: number;
  /** Anything else the bot must or must not do. */
  rules?: string[];
}

export interface LeadInput {
  name?: string;
  /** Preferred language code, if known (e.g. from a form). */
  language?: string;
  phone: string;
  email?: string;
  source?: string;
  /** Anything already known; the bot will not ask again. */
  known?: Record<string, string | number | boolean>;
  notes?: string;
}

export type CallAction = 'continue' | 'end' | 'transfer' | 'callback';

export interface TranscriptTurn {
  role: 'bot' | 'prospect';
  text: string;
  at: string;
}

export interface CallState {
  /** Our id for the call (Firestore doc id). For outbound calls it exists before Twilio's sid. */
  callSid: string;
  twilioSid?: string;
  playbookId: string;
  leadId: string;
  lead: LeadInput;
  direction: 'outbound' | 'inbound' | 'simulated';
  /** relay = streaming ConversationRelay, gather = basic Twilio speech webhooks. */
  channel?: 'relay' | 'gather' | 'simulated';
  /** Set once the relay WebSocket has connected; the relay then owns finalisation. */
  relayConnected?: boolean;
  /** Current spoken language code. */
  language: string;
  /** Claude conversation history, append-only (thinking blocks kept as returned). */
  messages: unknown[];
  /** Caller words from turns that were cut off before the model finished; sent with the next turn. */
  pendingCaller?: string[];
  status: 'in_progress' | 'completed' | 'failed' | 'no_answer';
  transcript: TranscriptTurn[];
  captured: Record<string, string | number | boolean>;
  turns: number;
  silentTurns: number;
  outcome?: CallAction;
  callbackAt?: string;
  optOut?: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface LeadResult {
  score: number;
  tier: 'hot' | 'warm' | 'cold' | 'disqualified';
  disqualifiedReason?: string;
  missingRequired: string[];
  breakdown: { key: string; value: unknown; points: number; weight: number }[];
}
