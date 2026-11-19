# Sales & lead-qualification calling bot

A phone bot that calls (or answers) prospects, has a natural sales conversation,
collects qualification answers, scores the lead hot / warm / cold / disqualified,
and writes a summary and next step for the sales team.

- Telephony: Twilio Programmable Voice (speech-to-text via `<Gather input="speech">`, text-to-speech via `<Say>` with Amazon Polly neural voices).
- Conversation: Claude (`CALLBOT_MODEL`, default `claude-opus-5-5` at `low` effort for phone-speed replies), returning structured JSON each turn.
- Scoring: deterministic, from weights in the playbook, so scores are explainable and consistent. The model only extracts answers.
- Storage: Firestore (`callbot_calls`, `callbot_leads`, `callbot_dnc`), server-side only.

## Playbooks: reuse it for any product

Each sales script is a JSON file in `src/lib/callbot/playbooks/`:

| Field | What it does |
|---|---|
| `company`, `agentName`, `product`, `valueProps` | What the bot is allowed to say. It will not make claims outside `valueProps`. |
| `opening`, `disclosure` | First line of the call. `{name}`, `{agent}`, `{company}` are filled in. The disclosure (AI + recording) is always read. |
| `callGoal` | What a successful call ends with (demo booked, WhatsApp link, viewing). |
| `fields[]` | What to learn. `type` is `text`, `number`, `boolean` or `choice`; `weight` sets importance in the score; `options[].points` (0-1) score choice answers; `idealMin` scores numbers; `hint` guides extraction (units, conversions). |
| `disqualifiers[]` | Answers that make a lead disqualified regardless of score. |
| `objections` | Approved answers to common pushback. |
| `tiers` | Score cut-offs for hot and warm. |
| `voice` | Twilio voice name and language, e.g. `Polly.Kajal-Neural` / `en-IN`. |
| `callingHours` | Local window outbound calls are allowed in. |
| `maxTurns`, `rules` | Length cap and any extra do / don't rules. |

Two examples ship: `neevv-homeowner` (homeowners planning to build) and
`uae-real-estate` (UAE buyer and investor enquiries). To add one, copy a file,
edit it, and register it in `src/lib/callbot/playbook.ts`.

## Setup

1. Twilio: buy a voice-capable number. For calls to India, complete Twilio's India
   regulatory bundle; for UAE, check Twilio's current UAE outbound rules first.
2. Set the env vars listed under "calling bot" in `.env.example` on Cloud Run
   (`ANTHROPIC_API_KEY`, `CALLBOT_ADMIN_KEY`, `CALLBOT_PUBLIC_URL`, `TWILIO_*`).
   `CALLBOT_PUBLIC_URL` must be the exact public https origin Twilio calls, or
   webhook signature checks will fail with 403.
3. Inbound calls (optional): on the Twilio number set
   - "A call comes in" → `POST {CALLBOT_PUBLIC_URL}/api/callbot/voice?playbook=neevv-homeowner`
   - "Call status changes" → `POST {CALLBOT_PUBLIC_URL}/api/callbot/status`
4. Open `/callbot`, enter the admin key.

## Using it

- **Rehearse**: type as the prospect to test a playbook. Same logic as real calls, no phone minutes.
- **Call leads**: paste `name, +phone, email` lines and dial. Skips numbers on the do-not-call list and refuses outside calling hours (tick "Ignore calling hours" only for testing).
- **Leads**: scored leads with summary, captured answers, next step and requested callback time.

API (all need header `x-callbot-key`):

```
POST /api/callbot/calls     { playbookId, leads: [{ name, phone, email?, source?, known?, notes? }], record?, ignoreCallingHours? }
GET  /api/callbot/leads
GET  /api/callbot/playbooks
POST /api/callbot/simulate  { playbookId, lead? } → opening; { state, message } → next turn; { state, end: true, save? } → score + summary
```

`known` lets you pass answers you already have (for example from a website form)
so the bot does not ask again. This makes a CRM or form-submit hook easy to add.

## Call flow

```
calls API ──saves state──► Twilio dials ──answered──► /voice  (disclosure + opening, <Gather>)
                                                         │
                        ┌────────────────────────────────┘
                        ▼
                     /turn  (speech → Claude → reply + captured answers)  ⟲ until end / transfer / callback
                        │
         call ends ──► /status (score + Claude summary → callbot_leads)
```

Answering machines are detected and hung up on without a pitch. Three silent
turns in a row end the call. If a prospect says to stop calling, the bot
confirms, ends the call and adds them to `callbot_dnc`.

## Compliance: read before dialing real people

- Call only people who gave consent to be contacted (form opt-in, enquiry). Cold
  calling numbers bought from lists is restricted in India (TRAI telemarketing
  rules; numbers on the NCPR/DND registry) and the UAE (TDRA rules on
  telemarketing hours and registered numbers). Check the current rules for your
  use, as they change.
- The bot always says it is an AI and that the call may be recorded. Keep that in every playbook.
- Recording is off by default (`record: true` per batch to turn it on).

## Known limits

- Latency: each turn is speech end → Claude → speech, typically 2-4 s of silence.
  To cut it, lower effort is already set; next steps would be streaming TTS over
  Twilio Media Streams or ConversationRelay, which need a WebSocket server rather
  than Cloud Run request/response.
- Twilio webhooks time out at 15 s; the Claude call has an 11 s timeout and falls
  back to "Sorry, could you say that again?".
- Rate limiting and the call queue are in-request (max 50 leads per request,
  about one dial per second). For large campaigns, move dialing to Cloud Tasks.
