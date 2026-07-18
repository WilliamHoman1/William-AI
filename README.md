# AI-Portfoliio
iOS portfolio that features my resume, about me, pictures, and more. Includes an AI chatbot, AI WilliamHoman. This bot can answer questions about me that complement the different "apps" on the user interface. Built to showcase my resume and my brand in a different angle.

## Chat backend

`api/chat.js` is a Vercel serverless function that proxies chat messages to the
Claude API (`claude-haiku-4-5`), with William's background baked into the system
prompt in that file.

### Deploy (Vercel)

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. In the Vercel project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` — your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
3. Deploy. Vercel auto-detects `api/chat.js` as a serverless function — no
   extra config needed. `index.html` is served as-is at the root.

### Local development

```bash
npm install
npm install -g vercel   # if you don't already have it
vercel dev
```

Copy `.env.example` to `.env.local` and fill in `ANTHROPIC_API_KEY` before
running `vercel dev` — it loads env vars from `.env.local` automatically.
