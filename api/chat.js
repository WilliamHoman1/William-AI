// Vercel serverless function: /api/chat
// Receives { messages: [{role, content}, ...] } from the phone UI's Chat app,
// calls the Claude API with William's background baked into the system prompt,
// and streams the reply back as plain-text chunks.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Best-effort in-memory rate limit: bounds worst-case cost if the public
// endpoint gets hammered by a bot/scraper. Resets on cold start and isn't
// shared across regions/instances, but catches the common case of repeated
// requests hitting the same warm instance.
const RATE_LIMIT = 12;          // requests
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

// Reject requests whose Origin doesn't match this deployment, so other sites
// can't embed a fetch() to this endpoint and spend the Anthropic budget.
// Non-browser callers (curl, server-to-server) send no Origin at all — those
// are left to the rate limiter above rather than blocked outright.
function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Site-wide daily token budget, backed by Vercel KV (Upstash Redis) so it's
// shared across regions/instances instead of resetting on every cold start
// like the per-IP rate limiter above. Entirely optional: if KV isn't
// configured or MAX_DAILY_TOKENS isn't set, budget checks are skipped and
// the endpoint behaves as before — same pattern as the optional ElevenLabs
// integration in api/tts.js.
// Vercel's Marketplace "Upstash" integration prefixes injected env vars with
// the database's name (here "TokenTracking"), and the naming has shifted
// across integration versions — accept whichever form is actually present
// rather than hardcoding one.
const KV_URL =
  process.env.TokenTracking_KV_REST_API_URL ||
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.TokenTracking_KV_REST_API_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_DAILY_TOKENS = Number(process.env.MAX_DAILY_TOKENS) || 0;
const BUDGET_ENABLED = Boolean(KV_URL && KV_TOKEN && MAX_DAILY_TOKENS > 0);

const FALLBACK_REPLY =
  "I've hit my usage limit for today, so live chat is paused until it resets. " +
  "Feel free to look through the Resume or Projects tabs, or email William directly " +
  "at williamhoman22@gmail.com.";

function todayKey() {
  return 'tokens:' + new Date().toISOString().slice(0, 10); // UTC day
}

async function kvCommand(...args) {
  const url = KV_URL + '/' + args.map(encodeURIComponent).join('/');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  if (!res.ok) throw new Error('KV command failed: ' + res.status);
  return (await res.json()).result;
}

async function isOverDailyBudget() {
  if (!BUDGET_ENABLED) return false;
  try {
    const used = Number(await kvCommand('get', todayKey())) || 0;
    return used >= MAX_DAILY_TOKENS;
  } catch (err) {
    console.error('KV budget check failed, allowing request', err);
    return false; // fail open — a KV outage shouldn't take the chat down
  }
}

async function recordTokenUsage(count) {
  if (!BUDGET_ENABLED || !count) return;
  try {
    const key = todayKey();
    await kvCommand('incrby', key, count);
    await kvCommand('expire', key, 60 * 60 * 48); // 2 days, so keys don't pile up
  } catch (err) {
    console.error('KV usage recording failed', err);
  }
}

const SYSTEM_PROMPT = `
You are "William-AI," a HUD-style console assistant on William Homan's personal site,
in the spirit of a JARVIS-like assistant — calm, precise, slightly formal, and helpful.
You answer questions about William's background on his behalf. Be clear you are an AI
assistant answering on his behalf, not William himself, if asked directly. Keep the tone
composed and a little futuristic, but never robotic filler — get to the point.

Background on William:
- AI/Automation Intern at Cox Enterprises, Atlanta, GA (May 2026 – Present). Builds RPA solutions,
  agentic AI workflows, and UiPath Studio automations; selected as 1 of 144 interns from 20,000+
  applicants company-wide.
- Associate of Science in Computer Science, Georgia Highlands College, Cartersville, GA
  (Aug 2024 – May 2026, GPA 4.0). Student athlete (baseball), President's List x4, NJCAA First Team
  All-Academic.
- Bachelor of Science in Computer Science, University of Georgia (expected Spring 2028).
- Harrison High School, Kennesaw, GA (Aug 2020 – May 2024, graduated).
- GitHub: WilliamHoman1
- LinkedIn: linkedin.com/in/william-azevedo-homan-122a68398

Projects:
- WilliamAI (this site): a 3D particle AI hub portfolio with a Claude-powered chatbot — GPU-shader
  particle system built with Three.js, plus voice input/output.
- Thrivalry App: AI-powered campaign management platform that organizes school-vs-school community
  service campaigns in partnership with nonprofit organizations. Uses Azure OpenAI to pair
  contestants together based on interests and experience. Built as an intern project with other
  IBT (Integrated Business Technologies) interns at Cox Enterprises. Next.js/React, Python, Azure
  Functions, Node.js.
- AI Powered Drone: a program built in VS Code and Unity using an Anthropic LLM for drones to
  identify targets, move towards them, and complete missions, with AI vision.
- Assignment Manager: used by Georgia Highlands College professors. Python, GitLab API, Claude API,
  backend + frontend (Textual), SQLite. Automates building and sending out problem set labs, with
  a chat bot so professors can create assignments with a prompt.
- SafeHome Game: a Python text-based adventure game with multiple features, visuals, and timed
  decisions.

Skills: Python, PyCharm, GitLab, GitHub, UiPath Studio, UiPath Orchestrator, Visual Studio Code,
Claude API, JavaScript, HTML, CSS. Also trades futures on the TopstepX platform.

Certifications: Anthropic Generative AI Development, UiPath Automation Associate Training, UiPath
Automation Explorer Training, Office 365.

You have tools that control the site's UI. When the visitor asks to see, open, or
navigate to a section (projects, resume, photos, about, history) or William's GitHub,
call the matching tool AND give a brief one-line confirmation. Don't call tools unless
the visitor asked to navigate somewhere.

Rules:
- Only answer questions about William's background, skills, and projects using the info above.
- If asked something you don't have info on, say you don't have that detail and suggest
  emailing William directly at williamhoman22@gmail.com.
- Default to SHORT, conversational answers — 1-3 sentences, this is a chat bubble, not an essay.
  Pick the single most relevant project/fact rather than listing everything you know.
- Only give a longer or fuller answer (e.g. listing multiple projects, going in depth on one)
  if the user explicitly asks for more detail, a full list, or "everything" — never by default.
- Never use markdown headers or bullet lists unless the user explicitly asked for a list.
- Never invent facts not listed above.
`.trim();

// Real tool use: Claude decides when to drive the site's UI. Tool invocations
// are forwarded to the browser as inline @@TOOL:{...}@@ markers in the text
// stream; the client strips them from the visible reply and executes them.
const TOOLS = [
  {
    name: 'open_section',
    description: "Open a section of William's portfolio UI for the visitor.",
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['about', 'resume', 'projects', 'photos', 'history'],
          description: 'Which section of the site to open',
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'open_github',
    description: "Open William's GitHub profile (github.com/WilliamHoman1) in a new tab.",
    input_schema: { type: 'object', properties: {} },
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait a bit before trying again.' });
  }

  if (await isOverDailyBudget()) {
    // Revert to a canned, non-LLM reply instead of calling Claude at all —
    // this is what actually stops spend once the daily cap is hit.
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(FALLBACK_REPLY);
  }

  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Basic guardrail: cap how much history gets sent / how long messages can be
    const trimmed = messages.slice(-12).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 1000),
    }));

    // Stream the reply as plain text chunks so the UI can render it
    // token-by-token as Claude writes it, instead of waiting for the
    // whole response before showing anything.
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: trimmed,
      tools: TOOLS,
    });

    // headers are sent lazily on the first chunk, so failures that happen
    // before Claude starts responding (bad API key, network) still surface
    // as a proper JSON error instead of an empty 200
    const startBody = () => {
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
    };

    let toolName = null;
    let toolJson = '';
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens;
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolName = event.content_block.name;
        toolJson = '';
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          startBody();
          res.write(event.delta.text);
        } else if (event.delta.type === 'input_json_delta') {
          toolJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop' && toolName) {
        let input = {};
        try { input = toolJson ? JSON.parse(toolJson) : {}; } catch (e) { /* malformed input — send empty */ }
        startBody();
        res.write('@@TOOL:' + JSON.stringify({ name: toolName, input }) + '@@');
        toolName = null;
      }
    }
    await recordTokenUsage(inputTokens + outputTokens);
    return res.end();
  } catch (err) {
    console.error(err);
    // headers already sent mid-stream — nothing to do but close the stream
    if (res.headersSent) {
      return res.end();
    }
    if (err instanceof Anthropic.APIError) {
      // Don't forward the raw upstream message to the client — it can include
      // account/request details that are only useful server-side.
      return res.status(err.status || 500).json({ error: 'Chat provider error' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
}
