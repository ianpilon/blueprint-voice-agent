# Developer Handoff Documentation — Blueprint

Blueprint is a voice AI agent that interviews a non-technical person about an app they want built, remembers them across calls, and at the end of each call turns the conversation into a structured, buildable spec (`spec-<caller>.md`).

This document explains how it works and how to run, modify, and deploy it.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [How It Works End-to-End](#how-it-works-end-to-end)
3. [File Structure](#file-structure)
4. [Setup & Configuration](#setup--configuration)
5. [Spec Generation](#spec-generation)
6. [Common Modifications](#common-modifications)
7. [API Reference](#api-reference)
8. [Data Storage](#data-storage)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)
11. [Testing](#testing)

---

## Architecture Overview

A **voice AI system** built on Vapi.ai. A local (or deployed) Node.js + Express server dynamically configures the assistant per call, remembers callers across calls, and generates a build spec from the transcript.

### Technology Stack
- **Voice Platform**: Vapi.ai (phone calls, speech-to-text, text-to-speech)
- **Backend**: Node.js + Express
- **Conversation AI Model**: OpenAI GPT-4 (run by Vapi, configured in the webhook response)
- **Spec-writing Model**: Groq `llama-3.3-70b-versatile` (called directly by this server at end-of-call, via Groq's OpenAI-compatible API)
- **Transcription**: Deepgram Nova-2
- **Voice**: Vapi built-in `Elliot` for web calls; configured in the Vapi dashboard for phone calls
- **Data Storage**: Postgres when `DATABASE_URL` is set, otherwise a local JSON file
- **Tunnel (local dev)**: ngrok or similar

### System Architecture

```
┌─────────────┐
│   Caller    │  (phone or Vapi Web SDK)
└──────┬──────┘
       │
       ↓
┌─────────────────────┐
│      Vapi.ai        │  voice processing, runs GPT-4 for the conversation
└──────┬──────────────┘
       │  webhooks
       ↓
┌─────────────────────────────────┐
│   Node server                   │
│   server-vapi-memory.js         │
│                                 │
│   ├─ reads enhanced-prompt.txt  │  ← persona + 7-lens framework
│   ├─ reads/writes memory        │  ← Postgres or vapi-memory.json
│   └─ at end-of-call:            │
│        calls Groq → writes      │  ← specs/spec-<caller>.md
│        specs/spec-<caller>.md   │
└─────────────────────────────────┘
```

---

## How It Works End-to-End

### 1. Incoming call
1. A call comes in; Vapi sends `POST /webhook/assistant-request`.
2. The server extracts the caller's phone number.
3. It reads the base persona from `enhanced-prompt.txt`.
4. It looks up the caller in storage. If they've called before, their prior conversation summary is appended to the system prompt so the spec resumes where it left off.
5. The server returns a transient assistant config (model, transcriber, first message, etc.).
6. Vapi greets the caller and the interview begins.

### 2. During the call
- Vapi posts real-time `transcript` events to the server, which logs them. No action beyond logging.

### 3. End of call
1. Vapi posts `POST /webhook/end-of-call-report` with the full transcript.
2. The server saves the transcript to the caller's history and rebuilds their conversation summary (last 3 calls).
3. The server then sends the caller's **entire** call history to Groq and writes a structured spec to `specs/spec-<caller>.md` (and, on Postgres, to a `spec` column). See [Spec Generation](#spec-generation).
4. Web calls (`web_*` numbers) are intentionally not persisted and produce no spec.

### 4. Returning caller
- On the next call, the server finds the caller, injects their history into the prompt, and greets them with the "welcome back" message. Each subsequent call refines and expands their spec.

---

## File Structure

```
blueprint-voice-agent/
├── server-vapi-memory.js       # Main webhook server (Express app)
├── enhanced-prompt.txt          # Persona + 7-lens spec discovery framework
├── vapi-memory.json            # Conversation storage in local dev (auto-created, gitignored)
├── specs/                      # Generated build specs (auto-created, gitignored)
│   └── spec-<caller>.md
├── .env.example                # Documents GROQ_API_KEY, SPEC_MODEL, DATABASE_URL, PORT
├── package.json                # Node dependencies
├── package-lock.json
├── fly.toml                    # Fly.io deploy config
├── render.yaml                 # Render.com deploy config (web service + Postgres)
├── Dockerfile
├── README.md                   # Quick start
├── DEVELOPER.md                # This file
├── get-voices.js               # Utility: list available ElevenLabs voices (needs your key)
└── test-webhook.js             # Utility: hit the assistant-request endpoint locally
```

### Key parts of `server-vapi-memory.js`
- **Storage adapter** (top of file): one object with the same methods backed by either Postgres or a local JSON file. Methods: `init`, `getCustomer`, `saveCall`, `getAll`, `count`, `saveSpec`, `getSpec`, `clear`.
- **`buildConversationSummary()`**: condenses the last 3 calls into the text injected for returning callers.
- **`generateSpec(callHistory)`**: sends the full transcript to Groq and returns markdown. No-ops (returns `null`) when `GROQ_API_KEY` is unset.
- **`handleAssistantRequest()`**: builds and returns the transient assistant config.
- **`handleEndOfCall()`**: saves the transcript, then generates and stores the spec.
- **`handleTranscript()`**: logs live transcript lines.

---

## Setup & Configuration

### 1. Create a Vapi account
1. Go to https://vapi.ai, sign up, and reach https://dashboard.vapi.ai.
2. Add a payment method (phone numbers ~$1-5/mo; calls ~$0.10-0.30/min depending on model + voice).
3. Buy a phone number under **Phone Numbers** (for inbound phone calls). Web SDK calls do not require a number.

### 2. Set up a Groq key (for spec generation)
1. Create a key at https://console.groq.com.
2. Put it in a local `.env` file (copy `.env.example`):
   ```
   GROQ_API_KEY=gsk_...
   ```
   Without it, calls still work and transcripts still save; only the spec generation is skipped.

### 3. Install and run
```bash
npm install
npm start          # http://localhost:3000
```

### 4. Expose with ngrok (local dev)
```bash
ngrok http 3000
```
Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.dev`). Keep the terminal open; if ngrok stops, the webhook breaks.

### 5. Point Vapi at the server
1. In the Vapi dashboard → **Phone Numbers** → your number.
2. **Server URL**: `https://your-ngrok-url/webhook/assistant-request`.
3. **Server Messages**: enable `end-of-call-report` and `transcript`.
4. **Voice**: choose a provider/voice (for phone calls; web calls use the built-in `Elliot`).
5. Save.

### 6. Test
- Call your number, or use the Vapi Web SDK pointing at `/webhook/assistant-request?web=1`.
- The agent opens with: *"...In a sentence or two, what's the thing you want to build?"*
- After you hang up, check server logs for `💾 Saved conversation` and `📐 Spec written`, and look in `specs/`.

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | For specs | Enables end-of-call spec generation (Groq). |
| `SPEC_MODEL` | No | Groq model for spec writing. Default `llama-3.3-70b-versatile`. |
| `DATABASE_URL` | No | Postgres connection string. When set, memory + specs persist in Postgres. |
| `PORT` | No | Server port. Default `3000`. |

---

## Spec Generation

At end-of-call, after the transcript is saved, the server calls `generateSpec(callHistory)`:

1. It concatenates **all** of the caller's calls into a single transcript (so the spec gets richer every call).
2. It sends that, with a fixed architect system prompt (`SPEC_SYSTEM_PROMPT` in the server), to Groq.
3. The model returns markdown in a fixed structure:
   - `# Title`
   - `## Overview`
   - `## Target Users`
   - `## Core Job`
   - `## User Flow`
   - `## Data Model`
   - `## Screens`
   - `## Version 1 Scope` (In / Out)
   - `## Open Questions`
4. The result is saved via `storage.saveSpec(phone, markdown)`:
   - **File backend**: writes `specs/spec-<sanitized-phone>.md`.
   - **Postgres backend**: stores it in the `spec` column (durable) and also writes the file (best-effort).
5. Retrieve it any time at `GET /spec/:phone`.

**Failure isolation**: spec generation runs in its own try/catch. If Groq errors (bad key, rate limit, outage), it's logged and the webhook still returns `200`; call saving is never affected.

**To change the spec format or model**, edit `SPEC_SYSTEM_PROMPT` or set `SPEC_MODEL` in the environment.

> Note: on ephemeral hosts (Render/Fly), the `specs/` files do not survive restarts. With `DATABASE_URL` set, the spec is also stored in Postgres, which is durable — use `GET /spec/:phone` to retrieve it.

---

## Common Modifications

### Change greeting messages
`server-vapi-memory.js`, in `handleAssistantRequest()`: the new-caller and returning-caller `firstMessage` strings.

### Change the agent's personality / interview framework
Edit `enhanced-prompt.txt`. The file is read fresh on every call, so no restart is needed for prompt changes (restart is only needed for code changes).

### Change the conversation AI model
`handleAssistantRequest()`, the `model` block (`provider`, `model`, `temperature`).

### Change the spec model or format
Set `SPEC_MODEL`, or edit `SPEC_SYSTEM_PROMPT` in the server.

### Change the voice
For phone calls, set it in the Vapi dashboard. For web calls, edit the inline `assistant.voice` (`{ provider: "vapi", voiceId: "Elliot" }`).

### Change call-end phrases or max duration
`handleAssistantRequest()`: `endCallPhrases` and `maxDurationSeconds`.

### Clear stored data
```bash
curl -X DELETE http://localhost:3000/memory   # clears memory (and Postgres specs)
rm -rf specs                                  # remove local spec files
```

---

## API Reference

### POST /webhook/assistant-request
Vapi calls this on an incoming call. Returns a transient assistant config. Append `?web=1` for Web SDK calls (adds an inline voice). Must respond within ~7.5s.

### POST /webhook/end-of-call-report
Vapi calls this when a call ends. Saves the transcript, rebuilds the summary, and generates the spec. Returns `200`.

### POST /webhook/transcript
Real-time transcript events during the call. Logged only. Returns `200`.

### GET /memory and GET /memory/:phone
View all conversation history, or one caller's.

### GET /spec/:phone
Returns the generated build spec for one caller as `text/markdown`. `404` if none exists.

### DELETE /memory
Clears all conversation history.

### GET /healthz
Health/keep-alive check: `{ ok: true, backend }`.

---

## Data Storage

The storage adapter presents one interface over two backends, chosen at startup by the presence of `DATABASE_URL`.

### Postgres (deployment)
Table `customers`:
- `phone_number` (PK), `first_call`, `call_history` (JSONB), `conversation_summary` (TEXT), `spec` (TEXT)

The `spec` column is added idempotently on `init()` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so existing deployments upgrade cleanly.

### Local JSON file (dev)
`vapi-memory.json`:
```json
{
  "customers": {
    "+15555555555": {
      "phoneNumber": "+15555555555",
      "firstCall": "2026-06-01T20:00:00.000Z",
      "callHistory": [
        {
          "callId": "abc-123",
          "date": "2026-06-01T20:00:00.000Z",
          "transcript": [
            { "role": "assistant", "message": "What do you want to build?" },
            { "role": "user", "message": "An app where customers book me." }
          ],
          "metadata": { "duration": 120, "endedReason": "customer-ended-call", "cost": 0.5, "summary": "" }
        }
      ],
      "conversationSummary": "PREVIOUS CONVERSATION HISTORY:\n..."
    }
  }
}
```
Specs are written alongside as `specs/spec-<sanitized-phone>.md`.

### Privacy
`vapi-memory.json` and `specs/` contain phone numbers, full transcripts, and the caller's app idea. Both are gitignored. For production, add auth to the API endpoints and a data-retention policy.

---

## Deployment

### Render (`render.yaml`)
Defines a Node web service plus a free Postgres database (`blueprint-db`). On deploy, `DATABASE_URL` is injected, so memory and specs persist in Postgres. Set `GROQ_API_KEY` as an environment variable in the Render dashboard (do not commit it).

### Fly.io (`fly.toml`)
App `blueprint-voice-agent`, internal port 3000, health check `/healthz`, one always-on machine. Set secrets with:
```bash
fly secrets set GROQ_API_KEY=gsk_...
fly secrets set DATABASE_URL=postgres://...   # if using Postgres
fly deploy --ha=false
```

For both platforms, point your Vapi number's Server URL at `https://<your-app-host>/webhook/assistant-request`.

---

## Troubleshooting

**Vapi shows 400/timeout on the Server URL** — server not running, ngrok pointing at the wrong port, or the prompt response took >7.5s. Restart server, restart ngrok on 3000, re-paste the URL.

**AI doesn't remember previous calls** — confirm `end-of-call-report` is enabled in Vapi; check logs for `💾 Saved conversation`; verify the phone number format matches what's stored.

**No spec is generated** — check logs. `⏭️ GROQ_API_KEY not set` means add the key. `❌ Failed to generate spec: Groq 401/429/...` means the key is invalid or rate-limited; the call itself still saved fine.

**Specs vanish after a deploy/restart** — expected on ephemeral hosts without Postgres. Set `DATABASE_URL` so specs persist, and read them via `GET /spec/:phone`.

**ngrok URL keeps changing** — free ngrok rotates URLs on restart. Use a paid static domain, Cloudflare Tunnel, or deploy.

---

## Testing

### Assistant-request endpoint
```bash
npm start
node test-webhook.js     # prints the system-prompt length and excerpts
```

### End-of-call + spec, locally
```bash
# With GROQ_API_KEY set in .env:
curl -X POST http://localhost:3000/webhook/end-of-call-report \
  -H 'Content-Type: application/json' \
  -d '{"message":{"type":"end-of-call-report","call":{"id":"c1","customer":{"number":"+15551234567"},"duration":90,"endedReason":"customer-ended-call"},"artifact":{"transcript":"yes","messagesOpenAIFormatted":[{"role":"assistant","content":"What do you want to build?"},{"role":"user","content":"A dog-walking booking app where customers pick a time slot."}]}}}'

cat specs/spec-15551234567.md          # the generated spec
curl http://localhost:3000/spec/+15551234567   # same spec via the API
```

### Memory API
```bash
curl http://localhost:3000/memory
curl http://localhost:3000/memory/+15551234567
curl -X DELETE http://localhost:3000/memory
```

---

**Version**: 1.0.0
