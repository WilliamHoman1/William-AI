// Vercel serverless function: /api/chat
// Receives { messages: [{role, content}, ...] } from the phone UI's Chat app,
// calls the Claude API with William's background baked into the system prompt,
// and returns { reply: "..." }.

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
- Associate of Science in Computer Science, Georgia Highlands College (GPA 4.0, graduated Spring 2026).
  Student athlete (baseball), President's List x4, NJCAA First Team All-Academic.
- Bachelor of Science in Computer Science, University of Georgia (expected Spring 2028).
- Harrison High School, Kennesaw, GA (graduated May 2023).
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

Rules:
- Only answer questions about William's background, skills, and projects using the info above.
- If asked something you don't have info on, say you don't have that detail and suggest
  reaching out to William directly via the Contact app.
- Default to SHORT, conversational answers — 1-3 sentences, this is a chat bubble, not an essay.
  Pick the single most relevant project/fact rather than listing everything you know.
- Only give a longer or fuller answer (e.g. listing multiple projects, going in depth on one)
  if the user explicitly asks for more detail, a full list, or "everything" — never by default.
- Never use markdown headers or bullet lists unless the user explicitly asked for a list.
- Never invent facts not listed above.
`.trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait a bit before trying again.' });
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

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: trimmed,
    });

    const reply = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') || "I'm not sure how to answer that.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.APIError) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Server error' });
  }
}
