require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// CORS — allow the GitHub Pages site (and local dev) to fetch assistant configs
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  console.log(`\n📨 ${req.method} ${req.path}`);
  next();
});

// ============================================================
// Storage adapter
//   - Postgres when DATABASE_URL is set (Render deployment)
//   - Local JSON file otherwise (local dev)
// ============================================================

const usePostgres = !!process.env.DATABASE_URL;
let storage;

if (usePostgres) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  storage = {
    backend: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
          phone_number TEXT PRIMARY KEY,
          first_call TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          call_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          conversation_summary TEXT NOT NULL DEFAULT ''
        );
      `);
      await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS spec TEXT NOT NULL DEFAULT '';`);
    },
    async getCustomer(phone) {
      const { rows } = await pool.query(
        'SELECT phone_number, first_call, call_history, conversation_summary FROM customers WHERE phone_number = $1',
        [phone]
      );
      if (rows.length === 0) return null;
      return rowToCustomer(rows[0]);
    },
    async saveCall(phone, callRecord) {
      const existing = await this.getCustomer(phone);
      const callHistory = existing ? [...existing.callHistory, callRecord] : [callRecord];
      const summary = buildConversationSummary(callHistory.slice(-3));
      await pool.query(
        `INSERT INTO customers (phone_number, first_call, call_history, conversation_summary)
         VALUES ($1, NOW(), $2::jsonb, $3)
         ON CONFLICT (phone_number) DO UPDATE
           SET call_history = $2::jsonb, conversation_summary = $3`,
        [phone, JSON.stringify(callHistory), summary]
      );
      return callHistory.length;
    },
    async getAll() {
      const { rows } = await pool.query('SELECT * FROM customers');
      const customers = {};
      for (const row of rows) customers[row.phone_number] = rowToCustomer(row);
      return { customers };
    },
    async count() {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
      return rows[0].n;
    },
    async saveSpec(phone, markdown) {
      await pool.query('UPDATE customers SET spec = $2 WHERE phone_number = $1', [phone, markdown]);
      try { fs.writeFileSync(specFilePath(phone), markdown); } catch (e) { /* ephemeral FS */ }
    },
    async getSpec(phone) {
      const { rows } = await pool.query('SELECT spec FROM customers WHERE phone_number = $1', [phone]);
      return rows[0]?.spec || null;
    },
    async clear() {
      await pool.query('DELETE FROM customers');
    },
  };

  function rowToCustomer(row) {
    return {
      phoneNumber: row.phone_number,
      firstCall: row.first_call instanceof Date ? row.first_call.toISOString() : row.first_call,
      callHistory: row.call_history,
      conversationSummary: row.conversation_summary,
    };
  }
} else {
  const MEMORY_FILE = path.join(__dirname, 'vapi-memory.json');
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({ customers: {} }, null, 2));
  }
  const read = () => JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  const write = (data) => fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));

  storage = {
    backend: 'file',
    async init() {},
    async getCustomer(phone) {
      return read().customers[phone] || null;
    },
    async saveCall(phone, callRecord) {
      const data = read();
      if (!data.customers[phone]) {
        data.customers[phone] = {
          phoneNumber: phone,
          firstCall: new Date().toISOString(),
          callHistory: [],
          conversationSummary: '',
        };
      }
      data.customers[phone].callHistory.push(callRecord);
      data.customers[phone].conversationSummary = buildConversationSummary(
        data.customers[phone].callHistory.slice(-3)
      );
      write(data);
      return data.customers[phone].callHistory.length;
    },
    async getAll() {
      return read();
    },
    async count() {
      return Object.keys(read().customers).length;
    },
    async saveSpec(phone, markdown) {
      fs.writeFileSync(specFilePath(phone), markdown);
    },
    async getSpec(phone) {
      const p = specFilePath(phone);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    },
    async clear() {
      write({ customers: {} });
    },
  };
}

function buildConversationSummary(recentCalls) {
  if (recentCalls.length === 0) return '';

  let summary = `PREVIOUS CONVERSATION HISTORY:\n`;
  summary += `This caller has called ${recentCalls.length} time(s) before.\n\n`;

  recentCalls.forEach((call, index) => {
    const callDate = new Date(call.date).toLocaleDateString();
    summary += `Call ${index + 1} (${callDate}):\n`;

    const fullConversation = call.transcript
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.message}`)
      .join('\n');

    if (call.metadata?.summary) {
      summary += `Summary: ${call.metadata.summary}\n\n`;
    }

    const maxLength = 800;
    if (fullConversation.length > maxLength) {
      summary += fullConversation.substring(0, maxLength) + '...\n\n';
    } else {
      summary += fullConversation + '\n\n';
    }
  });

  summary += `\nIMPORTANT: Reference specific details from the previous conversation history above. The caller expects you to remember what they shared.\n`;

  return summary;
}

// ============================================================
// Spec generation
//   At end-of-call, turn the running transcript into a structured,
//   buildable markdown spec at specs/spec-<caller>.md.
//   Runs on Groq via its OpenAI-compatible API. Requires
//   GROQ_API_KEY; skipped gracefully when unset.
// ============================================================

const fetch = require('node-fetch');

const SPECS_DIR = path.join(__dirname, 'specs');
if (!fs.existsSync(SPECS_DIR)) fs.mkdirSync(SPECS_DIR, { recursive: true });

const specFilePath = (phone) =>
  path.join(SPECS_DIR, `spec-${String(phone).replace(/[^a-zA-Z0-9]/g, '')}.md`);

const SPEC_SYSTEM_PROMPT = `You are a senior software architect. You will be given the transcript of one or more voice conversations between an interviewer ("Blueprint") and a non-technical person describing an app they want built. Turn that conversation into a clear, structured specification a developer or a coding AI could build from.

Translate the person's plain-language descriptions into concrete software requirements. Infer reasonable structure where the conversation implies it, but do not invent major features they never mentioned. Where something important was never discussed, list it under "Open Questions" rather than guessing.

Output ONLY GitHub-flavored markdown, no preamble, in exactly this structure:

# <App name or one-line title>

## Overview
One short paragraph: what the app is and the problem it solves, in plain language.

## Target Users
The user roles, and who each one is.

## Core Job
The single most important thing the app must do.

## User Flow
Numbered, step-by-step path through the core action, framed as screens and actions.

## Data Model
The things the app stores, as a bulleted list. For each, list its fields and note relationships (e.g. "a Customer has many Bookings").

## Screens
The distinct screens or pages implied by the flow, each with a one-line purpose.

## Version 1 Scope
### In
What the first buildable version includes.
### Out (later)
What was explicitly deferred.

## Open Questions
Anything underspecified that a builder would need answered before starting.`;

async function generateSpec(callHistory) {
  if (!process.env.GROQ_API_KEY) {
    console.log('   ⏭️  GROQ_API_KEY not set — skipping spec generation');
    return null;
  }

  const conversation = callHistory
    .map((call, i) => {
      const lines = (call.transcript || [])
        .map(m => `${m.role === 'user' ? 'Client' : 'Blueprint'}: ${m.message}`)
        .join('\n');
      return `--- Call ${i + 1} ---\n${lines}`;
    })
    .join('\n\n');

  const model = process.env.SPEC_MODEL || 'llama-3.3-70b-versatile';

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SPEC_SYSTEM_PROMPT },
        { role: 'user', content: `Here is the full transcript:\n\n${conversation}\n\nWrite the specification.` },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Groq ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ============================================================
// Webhook routing
// ============================================================

app.post('/webhook/assistant-request', async (req, res) => {
  const messageType = req.body.message?.type || req.body.type;

  if (messageType === 'end-of-call-report') return handleEndOfCall(req, res);
  if (messageType === 'transcript') return handleTranscript(req, res);
  if (messageType === 'assistant-request') return handleAssistantRequest(req, res);

  console.log(`⚠️  Unknown message type: ${messageType}`);
  return res.sendStatus(200);
});

async function handleAssistantRequest(req, res) {
  console.log('\n🔍 DEBUG: Full webhook payload:');
  console.log(JSON.stringify(req.body, null, 2));

  const phoneNumber = req.body.message?.call?.customer?.number ||
                     req.body.message?.customer?.number ||
                     req.body.call?.customer?.number;

  console.log(`\n📞 Incoming call from: ${phoneNumber}`);

  const basePrompt = fs.readFileSync(
    path.join(__dirname, 'enhanced-prompt.txt'),
    'utf8'
  );

  const customer = await storage.getCustomer(phoneNumber);
  const pronunciationNote = "";

  let systemPrompt = basePrompt + pronunciationNote;
  let firstMessage = "Hey, thanks for calling. This is a relaxed conversation to take the idea in your head and turn it into a clear plan a builder could actually follow. You don't need to know anything about code. That's my job. So let's start simple. In a sentence or two, what's the thing you want to build?";

  if (!customer) {
    console.log(`   🆕 NEW CALLER - no history`);
  } else {
    console.log(`   ✅ RETURNING CALLER - ${customer.callHistory.length} previous call(s)`);
    systemPrompt = `${basePrompt}${pronunciationNote}\n\n---\n\n${customer.conversationSummary}`;
    firstMessage = "Welcome back. Last time we were turning your idea into a build plan. I remember where we left off. Want to pick it back up?";
    console.log(`   💭 Injecting conversation history (${customer.conversationSummary.length} chars)`);
  }

  const isWeb = req.query.web === '1';

  const assistant = {
    firstMessage: firstMessage,
    model: {
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
      messages: [{ role: "system", content: systemPrompt }]
    },
    recordingEnabled: true,
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en"
    },
    endCallPhrases: ["goodbye", "bye", "talk to you later", "gotta go", "have to go"],
    maxDurationSeconds: 1800,
    backgroundSound: "off",
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    serverMessages: ["end-of-call-report", "transcript"]
  };

  // Web SDK requires an inline voice; phone calls fall back to dashboard config
  if (isWeb) {
    assistant.voice = { provider: "vapi", voiceId: "Elliot" };
  }

  return res.json({ assistant });
}

async function handleEndOfCall(req, res) {
  console.log('\n🔍 DEBUG: End-of-call payload:');
  console.log(JSON.stringify(req.body, null, 2));

  const message = req.body.message || req.body;
  const call = message.call;
  const artifact = message.artifact;
  const phoneNumber = call?.customer?.number;

  console.log(`\n📞 Call ended: ${call?.id}`);
  console.log(`   Customer: ${phoneNumber}`);
  console.log(`   Duration: ${call?.endedReason}`);

  if (!phoneNumber || !artifact?.transcript) {
    console.log('   ⚠️  No phone number or transcript - skipping save');
    return res.sendStatus(200);
  }

  // Anonymous web calls: log but don't persist
  if (phoneNumber.startsWith('web_')) {
    console.log('   🌐 Anonymous web call - skipping save');
    return res.sendStatus(200);
  }

  const messages = artifact.messagesOpenAIFormatted || artifact.messages || [];
  const parsedTranscript = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, message: m.content || m.message }));

  const callRecord = {
    callId: call.id,
    date: new Date().toISOString(),
    transcript: parsedTranscript,
    metadata: {
      duration: call.duration,
      endedReason: call.endedReason,
      cost: call.cost,
      summary: message.summary || ''
    }
  };

  try {
    const total = await storage.saveCall(phoneNumber, callRecord);
    console.log(`💾 Saved conversation for ${phoneNumber} (${total} total calls)`);
  } catch (err) {
    console.error('❌ Failed to save call:', err);
  }

  // Turn the running transcript into a structured, buildable spec
  try {
    const updated = await storage.getCustomer(phoneNumber);
    const spec = await generateSpec(updated.callHistory);
    if (spec) {
      await storage.saveSpec(phoneNumber, spec);
      console.log(`📐 Spec written: ${path.basename(specFilePath(phoneNumber))} (${spec.length} chars)`);
    }
  } catch (err) {
    console.error('❌ Failed to generate spec:', err.message);
  }

  return res.sendStatus(200);
}

function handleTranscript(req, res) {
  const message = req.body.message || req.body;
  const transcript = message.transcript;
  const role = transcript?.role === 'user' ? '👤 User' : '🤖 Assistant';
  console.log(`   ${role}: ${transcript?.text || transcript?.transcript}`);
  return res.sendStatus(200);
}

app.post('/webhook/end-of-call-report', handleEndOfCall);
app.post('/webhook/transcript', handleTranscript);

// ============================================================
// Status + memory API
// ============================================================

app.get('/', async (req, res) => {
  const customerCount = await storage.count();
  res.type('html').send(`<!doctype html>
<html><head><title>Blueprint</title>
<style>body{font-family:system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#222}
code{background:#f3f3f3;padding:2px 6px;border-radius:4px}
.ok{color:#0a7d2e;font-weight:600}
.meta{color:#666;font-size:14px}</style></head>
<body>
<h1>Blueprint</h1>
<p class="ok">Server is running on port ${port}.</p>
<p class="meta">Storage backend: <strong>${storage.backend}</strong></p>
<p>Customers in memory: <strong>${customerCount}</strong></p>
<h3>Endpoints</h3>
<ul>
  <li><code>POST /webhook/assistant-request</code> — Vapi webhook</li>
  <li><code>POST /webhook/end-of-call-report</code></li>
  <li><code>POST /webhook/transcript</code></li>
  <li><a href="/memory">GET /memory</a> — view all conversation history</li>
  <li><code>GET /memory/:phone</code> — view one caller's history</li>
  <li><code>DELETE /memory</code> — clear all history</li>
  <li><code>GET /spec/:phone</code> — view the generated build spec for one caller</li>
  <li><a href="/healthz">GET /healthz</a> — keep-alive ping target</li>
</ul>
</body></html>`);
});

app.get('/healthz', (req, res) => res.json({ ok: true, backend: storage.backend }));

app.get('/memory/:phone?', async (req, res) => {
  try {
    if (req.params.phone) {
      const customer = await storage.getCustomer(req.params.phone);
      return customer ? res.json(customer) : res.status(404).json({ error: 'Not found' });
    }
    res.json(await storage.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/memory', async (req, res) => {
  try {
    await storage.clear();
    res.json({ message: 'Memory cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/spec/:phone', async (req, res) => {
  try {
    const spec = await storage.getSpec(req.params.phone);
    if (!spec) return res.status(404).json({ error: 'No spec found for this caller' });
    res.type('text/markdown').send(spec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Startup
// ============================================================

(async () => {
  try {
    await storage.init();
  } catch (err) {
    console.error('❌ Storage init failed:', err);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log('\n🚀 Blueprint Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Server: http://localhost:${port}`);
    console.log(`💽 Storage: ${storage.backend}`);
    console.log(`🎯 Assistant webhook: POST /webhook/assistant-request`);
    console.log(`📝 End of call: POST /webhook/end-of-call-report`);
    console.log(`💬 Transcript: POST /webhook/transcript`);
    console.log(`💾 View memory: GET /memory/:phone`);
    console.log(`📐 View spec: GET /spec/:phone`);
    console.log(`🗑️  Clear memory: DELETE /memory`);
    console.log(`❤️  Health: GET /healthz`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
})();
