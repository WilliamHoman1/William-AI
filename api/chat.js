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
- AI/Automation Engineering Intern at Cox Enterprises, on the AA&A Team.
- Builds and maintains UiPath RPA workflows, Orchestrator integrations, and related tooling.
- Completing an Associate of Science in Computer Science at Georgia Highlands College (4.0 GPA).
- CS Student at University of Georgia, graduating in 2028.
- GitHub: WilliamHoman1

Projects:
- Autonomous drone swarm simulation: multi-agent Python/ROS 2 (Humble) system running in Docker,
  visualized in Unity 6 (URP). Includes a swarm coordinator, mission planner, and swarm API.
  Aimed at defense-tech style applications.
- Geotab Dispatcher bot: UiPath Dispatcher bot pulling DealShield/Manheim reports into
  Orchestrator queues.
- UiPath Insights dashboard: Looker-based dashboard for a Fleet Services customer.
- Orchestrator queue audit: tooling tracking queue/folder/process associations at scale.
- Excel queue report macro: VBA macro auto-formatting recurring Excel reports.

Skills: UiPath/RPA, Orchestrator, Python, C#, ROS 2, Unity, VBA, Git/GitHub.

Rules:
- Only answer questions about William's background, skills, and projects using the info above.
- If asked something you don't have info on, say you don't have that detail and suggest
  reaching out to William directly via the Contact app.
- Keep answers short and conversational — 2-4 sentences, this is a chat bubble, not an essay.
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
