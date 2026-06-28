# Blueprint — Voice Bot That Turns an Idea Into a Build Spec

A proof-of-concept voice AI system using [Vapi](https://vapi.ai) that interviews a non-technical person about the app they want to build and turns the conversation into a clear, buildable specification a developer (or a coding AI) could work from. It remembers callers across calls, so a spec can be built up over several conversations.

The person talking to it never needs to know a single technical term. They describe what they want in plain words; the agent does the translating in the background.

## Features

- **Plain-language requirements discovery**: The caller speaks in everyday terms; the agent maps it to real features, screens, flows, and stored data.
- **Conversation Memory**: Automatically tracks and remembers caller history across multiple calls, so the spec gets built up over time.
- **Transient Assistant Pattern**: Dynamically configures the AI assistant per call via webhook.
- **7-Lens Spec Framework**: VISION, USER, CORE JOB, FLOW, MEMORY, LOOK & FEEL, BOUNDARIES, then a SYNTHESIS that reads the spec back in build-plan order.
- **GPT-4 Powered**: Advanced conversational AI capabilities.
- **Human-Centered Design**: No jargon, no talking down, the caller stays in control.

## Architecture

The system uses Vapi's transient assistant pattern, which means:
1. Each incoming call triggers a webhook to your server.
2. Your server dynamically returns the assistant configuration.
3. For returning callers, previous conversation history is injected into the system prompt so the spec resumes where it left off.
4. After calls end, transcripts are saved (Postgres in deployment, local JSON in dev).

## Prerequisites

- Node.js (v14 or higher)
- A [Vapi](https://vapi.ai) account
- A voice (the project uses the built-in Vapi `Elliot` voice for web calls; configure your own in the Vapi dashboard for phone calls)
- [ngrok](https://ngrok.com) or similar tool for exposing localhost to the internet

## Installation

1. Clone this repository:
```bash
git clone https://github.com/ianpilon/blueprint-voice-agent.git
cd blueprint-voice-agent
```

2. Install dependencies:
```bash
npm install
```

## Configuration

To customize how the agent interviews and what it captures, edit `enhanced-prompt.txt`. That file is the entire persona and discovery framework.

## Running the Server

### Step 1: Start the Server

```bash
npm start
```

Server starts on port 3000.

### Step 2: Expose with ngrok

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`).

### Step 3: Configure Vapi

1. Log into [Vapi Dashboard](https://dashboard.vapi.ai)
2. Go to Phone Numbers and select your number
3. Set Server URL to: `https://your-ngrok-url.ngrok.io/webhook/assistant-request`
4. Enable server messages: `end-of-call-report` and `transcript`

### Step 4: Test

Call your Vapi number. The agent opens by explaining it will turn your idea into a clear plan a builder could follow, then asks: "In a sentence or two, what's the thing you want to build?"

## File Structure

```
├── server-vapi-memory.js      # Main webhook server
├── enhanced-prompt.txt         # AI system prompt (persona + 7-lens spec framework)
├── vapi-memory.json           # Conversation storage in local dev (auto-created)
├── package.json               # Dependencies
├── test-webhook.js            # Test script
├── fly.toml / render.yaml     # Deploy configs
└── README.md                  # This file
```

## API Endpoints

- `POST /webhook/assistant-request` - Incoming call configuration
- `POST /webhook/end-of-call-report` - Save conversation history
- `POST /webhook/transcript` - Real-time transcript updates
- `GET /memory/:phone` - View caller history
- `DELETE /memory` - Clear all history

## License

MIT
