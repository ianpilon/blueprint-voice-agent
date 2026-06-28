# Developer Handoff Documentation

## ⚠️ CRITICAL: Read This First

**This codebase was previously configured with the original developer's Vapi account. That account will be shut down and is no longer accessible.**

### What You Need to Do:

1. **Create your own Vapi account** (see [Setup & Configuration](#setup--configuration))
2. **Purchase a new phone number** through your Vapi account
3. **No API keys are hardcoded** - you're starting fresh
4. **The old phone number `+1 (407) 436 6284` will stop working**

### Security Note:

All hardcoded credentials have been removed from this codebase:
- ✅ No Vapi API keys (not needed for webhooks)
- ✅ No ElevenLabs keys (optional utility script requires your own)
- ✅ Conversation data is gitignored

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [How It Works End-to-End](#how-it-works-end-to-end)
3. [File Structure](#file-structure)
4. [Setup & Configuration](#setup--configuration)
5. [Common Modifications](#common-modifications)
6. [API Reference](#api-reference)
7. [Data Storage](#data-storage)
8. [Troubleshooting](#troubleshooting)
9. [Testing](#testing)

---

## Architecture Overview

This is a **voice AI system** that remembers previous conversations with callers. It uses Vapi.ai for voice infrastructure and a local Node.js server for conversation memory and dynamic assistant configuration.

### Technology Stack
- **Voice Platform**: Vapi.ai (handles phone calls, speech-to-text, text-to-speech)
- **Backend**: Node.js + Express
- **AI Model**: OpenAI GPT-4
- **Voice Provider**: Configurable via Vapi dashboard (ElevenLabs, Deepgram, PlayHT, etc.)
- **Transcription**: Deepgram Nova-2
- **Tunnel**: ngrok (exposes localhost to internet)
- **Data Storage**: Local JSON file (`vapi-memory.json`)

### System Architecture

```
┌─────────────┐
│   Caller    │
└──────┬──────┘
       │
       │ (Phone Call)
       ↓
┌─────────────────────┐
│     Vapi.ai         │
│  Phone Numbers      │
│  Voice Processing   │
└──────┬──────────────┘
       │
       │ (Webhook Request)
       ↓
┌─────────────────────┐
│      ngrok          │
│  Public HTTPS URL   │
└──────┬──────────────┘
       │
       │ (Forward to localhost:3000)
       ↓
┌─────────────────────┐
│  Your Node Server   │
│  server-vapi-       │
│  memory.js          │
└──────┬──────────────┘
       │
       ├──→ Read: enhanced-prompt.txt
       ├──→ Read/Write: vapi-memory.json
       │
       └──→ Returns dynamic assistant config
```

---

## How It Works End-to-End

### 1. **Incoming Call Flow**

```
1. Caller dials Vapi phone number: +1 (407) 436 6284
2. Vapi receives call and triggers webhook to your server
3. Your server receives POST to /webhook/assistant-request
4. Server extracts caller's phone number from webhook payload
5. Server checks vapi-memory.json for previous conversation history
6. Server builds system prompt:
   - Base prompt from enhanced-prompt.txt
   - + Previous conversation history (if returning caller)
7. Server returns dynamic assistant configuration to Vapi
8. Vapi creates AI assistant with your custom prompt
9. AI greets caller: "Hi, you've reached Intent Discovery AI..."
10. Conversation begins
```

### 2. **During the Call**

```
1. Vapi sends real-time transcript updates to /webhook/transcript
2. Server logs these to console for monitoring
3. No action taken - just logging
```

### 3. **End of Call Flow**

```
1. Call ends (user hangs up or says "goodbye")
2. Vapi sends POST to /webhook/end-of-call-report
3. Server receives full transcript + metadata
4. Server extracts:
   - Phone number
   - Call ID
   - Full conversation transcript
   - Call duration, cost, end reason
5. Server saves to vapi-memory.json:
   - Adds call to customer's history
   - Builds conversation summary from last 3 calls
   - Stores for next call
```

### 4. **Returning Caller Flow**

```
1. Same caller dials again
2. Server finds phone number in vapi-memory.json
3. Server injects previous conversation history into system prompt
4. AI greets: "Welcome back to Intent Discovery AI!..."
5. AI references previous conversation in responses
```

---

## File Structure

```
Intent-Discovery-AI-Voice-Agent/
├── server-vapi-memory.js       # Main webhook server (Express app)
├── enhanced-prompt.txt          # AI system prompt (personality & instructions)
├── vapi-memory.json            # Conversation storage (auto-created, gitignored)
├── package.json                # Node dependencies
├── package-lock.json           # Dependency lock file
├── .gitignore                  # Git ignore rules
├── README.md                   # Quick start guide
├── DEVELOPER.md                # This file
├── get-voices.js               # Utility: List available ElevenLabs voices
└── test-webhook.js             # Utility: Test webhook locally
```

### Key Files Explained

#### **server-vapi-memory.js** (Main Server)
- Express server running on port 3000
- Handles 3 webhook endpoints:
  - `POST /webhook/assistant-request` - Returns dynamic assistant config
  - `POST /webhook/end-of-call-report` - Saves conversation history
  - `POST /webhook/transcript` - Logs real-time transcripts
- Manages conversation memory (read/write to vapi-memory.json)
- Injects conversation history for returning callers

**Key Functions:**
- `handleAssistantRequest()` - Lines 119-188: Main logic for building assistant
- `handleEndOfCall()` - Lines 190-227: Saves call transcripts
- `getCustomerHistory()` - Lines 33-36: Retrieves caller's history
- `saveCallTranscript()` - Lines 38-64: Stores conversation
- `buildConversationSummary()` - Lines 66-98: Creates summary from last 3 calls

#### **enhanced-prompt.txt** (AI Personality)
- System prompt that defines AI behavior
- Currently configured for Intent Discovery AI coach/interviewer
- Contains:
  - Core identity
  - Communication principles
  - Discovery framework (8 tiers of questions)
  - Emotional safety protocols
  - Multi-call strategy

#### **vapi-memory.json** (Conversation Database)
- Local JSON file storing all conversation history
- Structure:
```json
{
  "customers": {
    "+15555555555": {
      "phoneNumber": "+15555555555",
      "firstCall": "2025-12-01T20:00:00.000Z",
      "callHistory": [
        {
          "callId": "abc-123",
          "date": "2025-12-01T20:00:00.000Z",
          "transcript": [
            { "role": "assistant", "message": "Hello..." },
            { "role": "user", "message": "Hi..." }
          ],
          "metadata": {
            "duration": 120,
            "endedReason": "assistant-ended-call",
            "cost": 0.50
          }
        }
      ],
      "conversationSummary": "PREVIOUS CONVERSATION HISTORY:\n..."
    }
  }
}
```

---

## Setup & Configuration

### ⚠️ Important: Setting Up Your Own Vapi Account

**The previous developer's Vapi account will be shut down.** You need to create your own account and configure a new phone number.

#### Step 1: Create Vapi Account

1. Go to https://vapi.ai
2. Click "Sign Up" or "Get Started"
3. Create account with email/password or Google/GitHub
4. Verify your email if required
5. You'll be redirected to https://dashboard.vapi.ai

#### Step 2: Add Payment Method

Vapi requires a payment method to:
- Purchase phone numbers (~$1-5/month)
- Pay per-minute usage for calls
- Access AI models (GPT-4, etc.)

1. In Vapi dashboard, go to **Billing** or **Settings** → **Billing**
2. Add credit card or payment method
3. Optionally add credits to your account

**Cost estimates:**
- Phone number: $1-5/month (depends on region)
- Call costs: ~$0.10-0.30/minute (varies by AI model + voice provider)
- Example: 100 minutes/month = ~$10-30

#### Step 3: Get a Phone Number

1. In Vapi dashboard, navigate to **Phone Numbers**
2. Click **"Create Phone Number"** or **"Buy Number"**
3. Select your country/region (e.g., United States)
4. Choose area code (if available)
5. Select a phone number from available options
6. Confirm purchase

**You'll receive:**
- A phone number like `+1 (XXX) XXX-XXXX`
- This is your new inbound number for the voice bot

#### Step 4: Optional - Set Up Voice Provider API Keys

If you want to use specific voice providers (ElevenLabs, etc.), you may need API keys:

**For ElevenLabs:**
1. Go to https://elevenlabs.io
2. Create account
3. Go to Profile → API Keys
4. Copy your API key
5. In Vapi dashboard → Settings → Integrations
6. Add ElevenLabs API key

**For other providers:**
- Check Vapi documentation for each provider
- Some providers (like Vapi's built-in voices) don't require API keys

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ianpilon/Intent-Discovery-AI-Voice-Agent.git
   cd Intent-Discovery-AI-Voice-Agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3000`

4. **Expose server with ngrok:**
   ```bash
   ngrok http 3000
   ```
   Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)

   **Important:** Keep this terminal window open - if ngrok stops, your webhook will break.

5. **Configure Your Vapi Phone Number:**
   - Go to https://dashboard.vapi.ai
   - Navigate to **Phone Numbers**
   - Click on your newly purchased phone number
   - In the **Server URL** field, enter: `https://your-ngrok-url/webhook/assistant-request`
     - Replace `your-ngrok-url` with your actual ngrok URL from step 4
     - Example: `https://abc123.ngrok-free.dev/webhook/assistant-request`
   - Scroll down to **Server Messages** section
   - Enable these checkboxes:
     - ✅ `end-of-call-report`
     - ✅ `transcript`
   - **Voice Configuration:**
     - Scroll to **Voice** section
     - Choose provider (ElevenLabs, Deepgram, PlayHT, etc.)
     - Select voice from dropdown
     - Voice is NOT hard-coded in the webhook - you control it here
   - Click **Save** at the bottom

6. **Test Your Setup:**
   - Call your new Vapi phone number
   - You should hear: "Hi, you've reached Intent Discovery AI. Quick question before we start..."
   - Have a brief conversation
   - Say "goodbye" to end the call
   - Check your server terminal for logs:
     ```
     📞 Incoming call from: +1XXXXXXXXXX
     🆕 NEW CALLER - no history
     💾 Saved conversation for +1XXXXXXXXXX (1 total calls)
     ```
   - Verify `vapi-memory.json` was created in your project directory

### Important Notes About Phone Number Migration

**The old phone number `+1 (407) 436 6284` belongs to the previous developer and will stop working when their account is closed.**

To migrate:
- You cannot transfer phone numbers between Vapi accounts
- You must purchase a new number (steps above)
- Update any documentation with your new number
- Notify users/customers of the new number if needed

### Environment Variables
Currently, no environment variables are required. The server runs on port 3000 by default, or uses `process.env.PORT` if set.

### Vapi Dashboard Configuration

**Phone Number Settings:**
- **Server URL**: Your ngrok URL + `/webhook/assistant-request`
- **Voice**: Configure directly in Vapi dashboard (any provider/voice)
- **Model**: Configured by webhook (GPT-4)
- **Transcriber**: Configured by webhook (Deepgram Nova-2)

**Important**: The webhook returns a **transient assistant** configuration. This means:
- Each call gets a fresh assistant with updated context
- Voice is NOT hard-coded in webhook (controlled by Vapi dashboard)
- System prompt includes conversation history for returning callers

---

## Common Modifications

### 1. **Change Greeting Messages**

**File**: `server-vapi-memory.js`
**Lines**: 143, 151

```javascript
// New caller greeting
let firstMessage = "Hi, you've reached Intent Discovery AI. Quick question before we start...";

// Returning caller greeting
firstMessage = "Welcome back to Intent Discovery AI! I remember our last conversation...";
```

**After changing**: Restart server (`npm start`)

### 2. **Change AI Personality/Instructions**

**File**: `enhanced-prompt.txt`

Edit the entire prompt to change:
- Company name/identity (line 4)
- Communication style (lines 6-15)
- Questions the AI asks (lines 23-250)
- Call flow and strategy (lines 15-21, 196-220)

**After changing**: Restart server (server reads file on each call)

### 3. **Change Voice**

**Method**: Configure in Vapi.ai dashboard (NOT in code)

The voice configuration was intentionally removed from the webhook so you can:
1. Go to Vapi dashboard
2. Edit assistant or phone number settings
3. Select any voice provider (ElevenLabs, Deepgram, PlayHT, etc.)
4. Choose voice ID
5. Test immediately (no code changes needed)

### 4. **Change AI Model**

**File**: `server-vapi-memory.js`
**Lines**: 160-162

```javascript
model: {
  provider: "openai",
  model: "gpt-4",  // Change to "gpt-4o", "gpt-3.5-turbo", etc.
  temperature: 0.7  // Adjust creativity (0.0-1.0)
}
```

### 5. **Change Call End Phrases**

**File**: `server-vapi-memory.js`
**Line**: 180

```javascript
endCallPhrases: ["goodbye", "bye", "talk to you later", "gotta go", "have to go"]
```

Add or remove phrases that will end the call.

### 6. **Change Maximum Call Duration**

**File**: `server-vapi-memory.js`
**Line**: 181

```javascript
maxDurationSeconds: 1800  // 30 minutes (default)
```

### 7. **Clear All Conversation Memory**

**Method 1**: Delete the file
```bash
rm vapi-memory.json
```

**Method 2**: Use API endpoint
```bash
curl -X DELETE http://localhost:3000/memory
```

**Method 3**: Manual edit
Edit `vapi-memory.json` and remove specific customer records.

---

## API Reference

### 1. POST /webhook/assistant-request
**Purpose**: Vapi calls this when a call comes in. Returns dynamic assistant configuration.

**Request Body**:
```json
{
  "message": {
    "type": "assistant-request",
    "call": {
      "customer": {
        "number": "+15555555555"
      }
    }
  }
}
```

**Response**:
```json
{
  "assistant": {
    "firstMessage": "Hi, you've reached Intent Discovery AI...",
    "model": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "messages": [
        {
          "role": "system",
          "content": "You are Intent Discovery AI, a voice AI that operates in two modes..."
        }
      ]
    },
    "recordingEnabled": true,
    "transcriber": {
      "provider": "deepgram",
      "model": "nova-2",
      "language": "en"
    },
    "endCallPhrases": ["goodbye", "bye"],
    "maxDurationSeconds": 1800,
    "backgroundSound": "off",
    "backchannelingEnabled": true,
    "backgroundDenoisingEnabled": true,
    "serverMessages": ["end-of-call-report", "transcript"]
  }
}
```

**Response Time**: Must respond within 7.5 seconds (Vapi requirement)

---

### 2. POST /webhook/end-of-call-report
**Purpose**: Vapi calls this when call ends. Saves conversation to memory.

**Request Body**:
```json
{
  "message": {
    "type": "end-of-call-report",
    "call": {
      "id": "call-abc123",
      "customer": { "number": "+15555555555" },
      "duration": 120,
      "endedReason": "assistant-ended-call",
      "cost": 0.50
    },
    "artifact": {
      "messagesOpenAIFormatted": [
        { "role": "assistant", "content": "Hello..." },
        { "role": "user", "content": "Hi..." }
      ]
    }
  }
}
```

**Response**: `200 OK`

**Side Effects**:
- Saves transcript to `vapi-memory.json`
- Updates conversation summary
- Logs call details to console

---

### 3. POST /webhook/transcript
**Purpose**: Real-time transcript updates during call.

**Request Body**:
```json
{
  "message": {
    "type": "transcript",
    "transcript": {
      "role": "user",
      "text": "What services do you offer?"
    }
  }
}
```

**Response**: `200 OK`

**Side Effects**: Logs transcript to console

---

### 4. GET /memory/:phone (Optional)
**Purpose**: View conversation history for a specific phone number.

**Example**:
```bash
curl http://localhost:3000/memory/+15555555555
```

**Response**:
```json
{
  "phoneNumber": "+15555555555",
  "firstCall": "2025-12-01T20:00:00.000Z",
  "callHistory": [...],
  "conversationSummary": "PREVIOUS CONVERSATION HISTORY:..."
}
```

---

### 5. GET /memory (Optional)
**Purpose**: View all conversation history.

**Example**:
```bash
curl http://localhost:3000/memory
```

**Response**:
```json
{
  "customers": {
    "+15555555555": {...},
    "+15555556666": {...}
  }
}
```

---

### 6. DELETE /memory (Optional)
**Purpose**: Clear all conversation history.

**Example**:
```bash
curl -X DELETE http://localhost:3000/memory
```

**Response**:
```json
{
  "message": "Memory cleared"
}
```

---

## Data Storage

### Memory Structure

All conversation data is stored in `vapi-memory.json`.

**Key Fields:**
- `phoneNumber`: Caller's phone number (unique ID)
- `firstCall`: ISO timestamp of first call
- `callHistory`: Array of all calls (newest last)
- `conversationSummary`: Pre-built summary from last 3 calls

**Memory Retention:**
- Keeps last 3 calls in summary
- Stores full history indefinitely
- Each call includes full transcript

**Summary Format:**
```
PREVIOUS CONVERSATION HISTORY:
This caller has called 2 time(s) before.

Call 1 (12/1/2025):
Summary: The caller explored their client discovery needs...
User: Hello, who is this?
Assistant: I'm Intent Discovery AI...
...

Call 2 (12/2/2025):
...

IMPORTANT: Reference specific details from the previous conversation history above.
```

### Data Privacy Considerations

**⚠️ Important**: `vapi-memory.json` contains:
- Phone numbers
- Full conversation transcripts
- Call metadata (costs, duration)

**Security measures in place:**
- File is in `.gitignore` (not committed to GitHub)
- Stored locally only (not in cloud)

**For production deployment:**
- Move to encrypted database (MongoDB, PostgreSQL)
- Add authentication to API endpoints
- Implement data retention policies
- Consider GDPR/privacy compliance

---

## Troubleshooting

### Issue: Vapi shows "400 Bad Request" on Server URL

**Cause**: ngrok is pointing to wrong port, or server is not running.

**Solution**:
```bash
# 1. Verify server is running on port 3000
npm start

# 2. Kill any old ngrok processes
pkill ngrok

# 3. Start ngrok on port 3000
ngrok http 3000

# 4. Update Vapi with new ngrok URL
```

---

### Issue: AI doesn't remember previous conversations

**Possible causes:**

1. **Phone number not matching**
   - Check `vapi-memory.json` for exact phone format
   - Debug: Add `console.log(phoneNumber)` in line 125

2. **Memory not being saved**
   - Check if `end-of-call-report` webhook is enabled in Vapi
   - Check server logs for "💾 Saved conversation" message
   - Verify `vapi-memory.json` exists and has data

3. **Server restarted with old code**
   - Ensure server was restarted after code changes
   - Check that `enhanced-prompt.txt` wasn't reverted

---

### Issue: AI uses wrong voice

**Cause**: Voice might be cached or configured in wrong place.

**Solution**:
1. Verify voice is NOT hard-coded in `server-vapi-memory.js` (lines 170-173 should be deleted)
2. Configure voice in Vapi dashboard
3. Test with new call (not in-progress call)

---

### Issue: AI uses wrong name instead of "Intent Discovery AI"

**Cause**: Old prompt still in memory or cache.

**Solution**:
```bash
# 1. Verify enhanced-prompt.txt has "Intent Discovery AI" (line 4)
grep "Intent Discovery" enhanced-prompt.txt

# 2. Verify server-vapi-memory.js has "Intent Discovery AI" (lines 143, 151)
grep "Intent Discovery" server-vapi-memory.js

# 3. Restart server
npm start

# 4. Make a fresh call
```

---

### Issue: Webhook timeout (no response within 7.5 seconds)

**Possible causes:**
1. Prompt too large (enhanced-prompt.txt)
2. Slow file I/O
3. Network latency to Vapi

**Solutions:**
- Reduce prompt size (currently ~10KB is fine)
- Host server closer to Vapi (us-west-2 region)
- Add timeout logging:
  ```javascript
  console.time('webhook-response');
  // ... your code
  console.timeEnd('webhook-response');
  ```

---

### Issue: ngrok URL keeps changing

**Cause**: Free ngrok URLs rotate on restart.

**Solutions:**
1. **Paid ngrok**: Get static domain
2. **Alternatives**: Use Cloudflare Tunnel, Tailscale, or deploy to cloud
3. **Automation**: Script to update Vapi via API when ngrok URL changes

---

## Testing

### 1. Test Webhook Locally

```bash
# Start server
npm start

# In another terminal, test assistant-request endpoint
curl -X POST http://localhost:3000/webhook/assistant-request \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "assistant-request",
      "call": {
        "customer": {
          "number": "+15555555555"
        }
      }
    }
  }'
```

**Expected response**: JSON with assistant configuration

---

### 2. Test Through ngrok

```bash
# Get your ngrok URL
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/assistant-request \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "assistant-request",
      "call": {
        "customer": {
          "number": "+15555555555"
        }
      }
    }
  }'
```

**Expected**: Same response as local test

---

### 3. Test End-to-End with Vapi

1. Call the Vapi number: `+1 (407) 436 6284`
2. Verify greeting: "Hi, you've reached Intent Discovery AI..."
3. Have a short conversation
4. Say "goodbye" to end call
5. Check server logs for:
   ```
   📞 Incoming call from: +1XXXXXXXXXX
   🆕 NEW CALLER - no history
   💾 Saved conversation for +1XXXXXXXXXX (1 total calls)
   ```
6. Check `vapi-memory.json` was created/updated
7. Call again to test memory:
   ```
   📞 Incoming call from: +1XXXXXXXXXX
   ✅ RETURNING CALLER - 1 previous call(s)
   💭 Injecting conversation history (XXX chars)
   ```

---

### 4. Test Memory API

```bash
# View all memory
curl http://localhost:3000/memory

# View specific caller
curl http://localhost:3000/memory/+15555555555

# Clear all memory
curl -X DELETE http://localhost:3000/memory
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] **Replace local storage** with database (MongoDB, PostgreSQL, etc.)
- [ ] **Add authentication** to API endpoints
- [ ] **Use environment variables** for sensitive config
- [ ] **Deploy to cloud** (AWS, Google Cloud, Heroku, etc.)
- [ ] **Use static URL** (no ngrok in production)
- [ ] **Add error monitoring** (Sentry, LogRocket, etc.)
- [ ] **Add logging** (Winston, Bunyan, etc.)
- [ ] **Implement rate limiting** (express-rate-limit)
- [ ] **Add data retention policy** (auto-delete old calls)
- [ ] **HTTPS/SSL** for all connections
- [ ] **Backup strategy** for conversation data
- [ ] **Load testing** for concurrent calls
- [ ] **Add health check endpoint** (`GET /health`)
- [ ] **Document deployment process**

---

## Additional Resources

- **Vapi Documentation**: https://docs.vapi.ai
- **Vapi Dashboard**: https://dashboard.vapi.ai
- **ngrok Documentation**: https://ngrok.com/docs
- **GitHub Repository**: https://github.com/ianpilon/Intent-Discovery-AI-Voice-Agent

---

## Support & Questions

For questions or issues:
1. Check this documentation first
2. Review server logs for errors
3. Test webhook endpoints locally
4. Check Vapi dashboard for configuration issues
5. Review `vapi-memory.json` structure

**Common log patterns to look for:**
- `📞 Incoming call from:` - Call received
- `🆕 NEW CALLER` - First-time caller
- `✅ RETURNING CALLER` - Repeat caller
- `💭 Injecting conversation history` - Memory loaded
- `💾 Saved conversation` - Call saved successfully
- `📨 POST /webhook/` - Webhook received
- `⚠️ Unknown message type` - Unexpected webhook

---

**Last Updated**: December 1, 2025
**Version**: 1.0.0
**Maintainer**: Intent Discovery AI Team
