// Vercel serverless function: /api/tts
// Converts assistant reply text to speech using ElevenLabs, so replies are
// spoken with a specific chosen voice instead of the browser's built-in
// (often robotic) speechSynthesis voices. The UI falls back to the browser
// voice if this fails, isn't configured, or the ElevenLabs quota is used up.

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Same best-effort per-IP rate limit pattern as /api/chat — bounds worst-case
// ElevenLabs cost if this public endpoint gets hammered.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ELEVENLABS_API_KEY || !VOICE_ID) {
    return res.status(500).json({ error: 'ElevenLabs is not configured on the server' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait a bit before trying again.' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text required' });
  }
  const trimmed = text.slice(0, 800); // cap characters to bound cost per request

  try {
    const elResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!elResponse.ok) {
      const errText = await elResponse.text();
      console.error('ElevenLabs error', elResponse.status, errText);
      return res.status(502).json({ error: 'TTS provider error' });
    }

    const audioBuffer = Buffer.from(await elResponse.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
