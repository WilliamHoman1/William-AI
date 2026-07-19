# WilliamAI — Interactive AI Portfolio

**Live site:** [william-ai-lyart.vercel.app](https://william-ai-lyart.vercel.app)

A JARVIS-inspired portfolio built around a glowing 3D particle reactor you can *talk to*. Tap the core, ask a question out loud, and a Claude-powered AI assistant answers on William's behalf — streaming its reply live and speaking it back with a synthesized voice while the reactor pulses to the amplitude of its own speech.

No frameworks, no build step, no physics library — the entire visual layer is hand-written GLSL running on the GPU.

## Highlights

- **23,000+ GPU-driven particles** — the reactor core, solar flares, orbiting rings, lightning arcs, and background nebula are all driven by custom vertex/fragment shaders. Per-particle motion is a pure function of time + hashed per-particle seeds, so the CPU stays nearly idle regardless of particle count (this is what keeps phones cool and at 60fps).
- **Streaming AI chat** — replies stream token-by-token from the Claude API through a Vercel serverless function, rendering live as the model writes.
- **Streaming voice loop** — speech-to-text input via the Web Speech API; replies are spoken sentence-by-sentence *while they're still streaming in* (ElevenLabs server-side, browser voices as fallback). While you speak, an `AnalyserNode` on the raw mic stream pulses the orb with your actual volume; while the AI speaks, the same RMS technique makes it pulse syllable-by-syllable with its own voice.
- **Real agentic tool use** — the assistant is given `open_section` / `open_github` tools via the Claude API. Say "show me his projects" and the model itself decides to call the tool; invocations are forwarded through the text stream as inline markers and executed in the browser.
- **Conversation memory** — chats persist across visits (localStorage), with one-tap "email this transcript to William" and "clear memory" controls.
- **Diagnostics HUD** — press <code>`</code> (or the DIAG rail button) for live FPS, frame time, draw calls per renderer, particle count, and pixel ratio. The SYSTEMS button annotates the scene in place, explaining how each rendering technique works.
- **Cheap custom bloom** — instead of a postprocessing pipeline, each WebGL canvas is mirrored to a low-res 2D canvas that's blurred, brightened, and screen-blended via CSS. Looks like bloom, costs almost nothing.
- **Mobile-first details** — pointer-reactive seeker lightning, a bottom-sheet chat drawer, reduced pixel-ratio caps on battery-constrained devices, and `prefers-reduced-motion` support throughout.

## Performance & quality

**Lighthouse: 100 Accessibility · 100 SEO · 96+ Best Practices** (the only flagged item is a dev-server-only analytics 404). The performance score under Lighthouse's throttled, GPU-less headless browser isn't meaningful for a WebGL-heavy page; the numbers that matter here are architectural:

- An earlier version recomputed ~15,000 particle positions in a JavaScript loop 60×/sec — the main thread was the bottleneck and phones ran hot. Every particle system was rewritten so position is computed *in the vertex shader* from a `uTime` uniform + per-particle attributes. The CPU now uploads nothing per frame; particle count stopped mattering.
- The whole page is a handful of static files with no build step, no framework runtime, and no external requests (Three.js is vendored). First paint is just HTML + CSS.
- Keyboard navigable end-to-end (rails, tabs, core, chat), `aria-live` chat log, visible focus rings, Escape closes any layer, and `prefers-reduced-motion` disables the boot sequence and animations.

## Architecture

```
index.html            single page, no build step
css/style.css         HUD styling, custom reticle cursor, cheap CSS bloom
js/scene-shared.js    shared shader chunks, glow sprite, pixel-ratio policy, HUD stats
js/particle-field.js  background nebula: clustered starfield + cosmic-web filaments
js/particle-core.js   the reactor: core sphere, flares, rings, lightning, seeker bolts
js/ui.js              boot, panels, chat, voice I/O, speech queue, HUD, tool execution
js/three.min.js       Three.js r128, vendored (no CDN dependency)
api/chat.js           Vercel serverless fn → Claude API (streaming + tool use, rate-limited)
api/tts.js            Vercel serverless fn → ElevenLabs TTS (key stays server-side)
```

Both API keys live only in serverless functions — nothing sensitive ever ships to the client. The chat endpoint includes a per-IP rate limit and caps message history/length as a cost guardrail.

## Stack

Three.js (WebGL) · custom GLSL shaders · Web Speech API · Web Audio API · Claude API (`claude-haiku-4-5`) · ElevenLabs TTS · Vercel serverless functions

## Deploy (Vercel)

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. In **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
   - `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` *(optional)* — enables the natural TTS voice; without them, replies fall back to the browser's built-in speech synthesis.
3. Deploy. Vercel auto-detects the `api/` functions — no extra config needed.

## Local development

```bash
npm install
npm install -g vercel   # if you don't already have it
vercel dev
```

Copy `.env.example` to `.env.local` and fill in the keys — `vercel dev` loads it automatically.

---

Built by [William Homan](https://www.linkedin.com/in/william-azevedo-homan-122a68398) · [GitHub](https://github.com/WilliamHoman1)
