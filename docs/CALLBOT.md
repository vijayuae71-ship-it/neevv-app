# Sales & lead-qualification calling bot

A phone bot that calls (or answers) prospects in their own language, holds a
natural sales conversation, collects qualification answers, scores the lead
hot / warm / cold / disqualified, and writes an English summary and next step
for the sales team.

## How it sounds human

| What | How |
|---|---|
| Natural voice | Twilio ConversationRelay with neural voices: ElevenLabs Flash v2.5 (multilingual) or Google Chirp 3 HD, set per language in the playbook. |
| Replies start fast | Claude's reply is streamed token by token into text-to-speech, so the caller hears the first words while the rest is still being written. One model request per turn. |
| Caller can interrupt | Barge-in is on. When the caller talks over the bot, speech stops, the unfinished reply is dropped, and the model is told exactly what the caller heard before cutting in. What they said is never lost. |
| No dead air | If a reply takes longer than `CALLBOT_FILLER_MS`, the bot sometimes says a short filler ("Hmm, okay.", "Ji, theek hai.") first. After `CALLBOT_IDLE_MS` of silence it gently checks the caller is still there, and after repeated silence it says goodbye. |
| Talks like a person | Persona per playbook, short spoken sentences, varied acknowledgements, matches the caller's energy, says numbers the way people say them ("forty-five lakh"), guesses through speech-recognition errors instead of asking to repeat. |
| Honest | It always says it is an AI assistant at the start, and says so if asked. The persona is a name and manner, not a claim to be human. Keep this: India's and the UAE's consumer rules and Twilio's terms expect disclosure, and callers who find out later feel tricked. |

## Languages

The caller can switch language at any point: speak Hindi, or say "Arabic
please", and the bot switches its voice, speech recognition and reply language
mid-call. Leads can also start in a language (`language: "ta-IN"`).

| Playbook | Languages included |
|---|---|
| `neevv-homeowner` | English (Indian), Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati |
| `uae-real-estate` | English, Arabic, Hindi, Urdu, Russian, Mandarin, French |

English and Hindi use Deepgram's `multi` recognition, which handles Hinglish
(mixed Hindi and English in one sentence). Other Indian languages and Arabic use
Google recognition. Each language's voice, recognition provider and model are
plain config in the playbook, so you can swap them without code changes.

**Check before going live:** test each language you plan to use with a real
call, and confirm voice IDs and model names against Twilio's current
ConversationRelay voice and language lists in the Twilio console. Provider
coverage changes, and this code couldn't reach Twilio's docs when it was written.
The default ElevenLabs voice is a placeholder: pick a voice from ElevenLabs'
library that fits the persona and set `CALLBOT_ELEVENLABS_VOICE` or `voice` per
language.

## Architecture

```
                   ┌──────────── Next.js app (Cloud Run) ────────────┐
 /callbot console ─┤ /api/callbot/calls     dial leads               │
                   │ /api/callbot/voice     call answered → TwiML    │──┐
                   │ /api/callbot/handoff   relay ended → hang up / transfer
                   │ /api/callbot/status    no-answer bookkeeping    │  │
                   │ /api/callbot/simulate  text rehearsal           │  │
                   └──────────────────────────────────────────────────┘  │
                                                                         ▼
 caller ⇄ Twilio (speech recognition + neural TTS) ⇄ wss ⇄ callbot-relay (Cloud Run)
                                                              │  streams Claude replies
                                                              │  barge-in, language switch, fillers
                                                              └→ Firestore: call state, scored lead
```

- `src/lib/callbot/agent.ts`: the conversation engine (prompt, streaming, output parsing). Shared by every mode.
- `src/lib/callbot/session.ts`: call lifecycle. `playbook.ts`: playbooks, languages, scoring. `twilio.ts`: TwiML and signatures. `store.ts`: Firestore.
- `callbot-relay/server.ts`: the ConversationRelay WebSocket server.

Model output per turn is plain text: an optional `[[hi-IN]]` language tag, the
spoken reply, then a `<<<{json}>>>` metadata line with captured answers and the
next action. Only the spoken part reaches the caller. Scoring is deterministic
from playbook weights; the model only extracts answers.

Without `CALLBOT_RELAY_URL` the app falls back to basic mode (`<Gather>` +
`<Say>`), which works without the relay service but sounds noticeably more
robotic: no interruptions, a pause after every turn, and no streaming.

## Playbooks

Each sales script is a JSON file in `src/lib/callbot/playbooks/`. Register new
ones in `src/lib/callbot/playbook.ts`.

| Field | What it does |
|---|---|
| `company`, `agentName`, `persona` | Who the bot is and how it comes across. |
| `product`, `valueProps` | What it may say. It won't make claims outside `valueProps`. |
| `opening`, `disclosure` | Scripted first line in `defaultLanguage`, spoken instantly on pickup. `{name}`, `{agent}`, `{company}` are filled in. For other languages, add `openingByLanguage`, or the model writes the opening. |
| `callGoal` | What a good call ends with. |
| `fields[]` | What to learn: `type` (`text`, `number`, `boolean`, `choice`), `weight`, `options[].points`, `idealMin`, `hint`. |
| `disqualifiers[]`, `tiers` | Hard disqualifiers and the hot/warm score cut-offs. |
| `objections`, `rules` | Suggested answers to pushback and extra do / don't rules. |
| `defaultLanguage`, `languages[]` | Per language: `code`, `name`, `ttsProvider`, `voice`, `transcriptionProvider`, `speechModel`, `transcriptionLanguage`, `sayVoice` (basic mode), `fillers`, `style`. |
| `callingHours`, `maxTurns` | Outbound calling window and length cap. |

## Setup

1. **Twilio**: a voice number. For calls to India, complete Twilio's India
   regulatory bundle; for UAE, check Twilio's current UAE outbound rules first.
   In the Twilio console, accept ConversationRelay's terms (it uses AI voice
   providers) if prompted.
2. **Relay service**: deploy `callbot-relay` as its own Cloud Run service:
   ```
   gcloud builds submit --tag gcr.io/$PROJECT/callbot-relay -f callbot-relay/Dockerfile .   # or docker build from repo root
   gcloud run deploy callbot-relay --image gcr.io/$PROJECT/callbot-relay \
     --timeout=3600 --min-instances=1 --no-cpu-throttling --session-affinity \
     --set-env-vars CALLBOT_RELAY_URL=wss://<service-url>/relay,CALLBOT_PUBLIC_URL=https://neevv.in \
     --set-secrets ANTHROPIC_API_KEY=...,TWILIO_AUTH_TOKEN=...
   ```
   `--timeout=3600` lets calls run up to an hour; `--min-instances=1` avoids a
   cold start when someone picks up. Give its service account Firestore access.
3. **App env**: on the main app set `ANTHROPIC_API_KEY`, `CALLBOT_ADMIN_KEY`,
   `CALLBOT_PUBLIC_URL`, `CALLBOT_RELAY_URL` and `TWILIO_*` (see `.env.example`).
   `CALLBOT_PUBLIC_URL` and `CALLBOT_RELAY_URL` must be the exact public URLs
   Twilio uses, or signature checks will reject Twilio with 403.
4. **Inbound calls** (optional): on the Twilio number set
   "A call comes in" → `POST {CALLBOT_PUBLIC_URL}/api/callbot/voice?playbook=neevv-homeowner`
   and "Call status changes" → `POST {CALLBOT_PUBLIC_URL}/api/callbot/status`.
5. Open `/callbot`, enter the admin key, rehearse, then dial.

## Using it

- **Rehearse**: type as the prospect in any supported language and script. Same engine as real calls.
- **Call leads**: paste `name, +phone, email, language` lines (email and language optional). Skips do-not-call numbers and refuses outside calling hours unless overridden.
- **Leads**: scored leads with English summary, captured answers, language spoken, next step and callback time.

API (all need header `x-callbot-key`):

```
POST /api/callbot/calls     { playbookId, leads: [{ name, phone, language?, email?, source?, known?, notes? }], record?, ignoreCallingHours? }
GET  /api/callbot/leads
GET  /api/callbot/playbooks
POST /api/callbot/simulate  { playbookId, lead? } | { state, message } | { state, interrupt, message } | { state, end: true, save? }
```

## Compliance: read before dialing real people

- Call only people who gave consent to be contacted. Cold calling bought lists is
  restricted in India (TRAI telemarketing rules, NCPR/DND registry) and the UAE
  (TDRA telemarketing rules). Check the current rules; they change.
- Keep the AI and recording disclosure in every language's opening.
- Recording is off by default (`record: true` per batch turns it on).

## Testing status and limits

- Tested here: the full streaming flow through the relay with a simulated Twilio
  client and a simulated Claude stream (English → Hindi switch mid-call, caller
  interrupting mid-reply, captured answers, goodbye then hang-up, scoring and
  summary). Not yet tested: a real phone call, real Claude replies, the relay's
  Docker image, and the voice/model names against Twilio's live provider lists.
- Latency is roughly: speech recognition end-of-turn + time to Claude's first
  token + TTS start. Opus 5.5 at `low` effort is the default; if the first words
  still feel slow on real calls, try `CALLBOT_MODEL=claude-sonnet-5-5`, and
  measure before and after.
- Hang-up timing after the goodbye is estimated from text length.
- Large campaigns: dialing is in-request (max 50 leads, about one per second); move to Cloud Tasks for scale.
