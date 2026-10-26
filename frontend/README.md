# Frontend

React + TypeScript + Vite + Tailwind CSS, with local vocabulary storage and an optional Cloudflare translation API.

For production NVIDIA translation, follow the [Cloudflare Worker deployment guide](../docs/cloudflare-worker.md).

See the [repository README](../README.md) for prerequisites, environment configuration, development commands, checks and the deployment plan.

## Translate (local API)

Simple 9Router configuration: set `OPENAI_HOST=http://localhost:20128/v1`, `OPENAI_MODEL=<exact gateway model ID>`, and `OPENAI_API_KEY=<gateway key>` in `.env.local`. `OPENAI_HOST` automatically selects the compatible API. These variables take precedence over `ROUTER_*`; the previous configuration remains supported. Explicit `TRANSLATE_PROVIDER=gemini` selects Gemini instead. Restart Vite after changes.

1. Copy `frontend/.env.example` to `frontend/.env.local`. For **9Router**, set `TRANSLATE_PROVIDER=9router`, `ROUTER_BASE_URL` (default `http://localhost:20128/v1`), `ROUTER_API_KEY` (the gateway key from your 9Router dashboard), and `ROUTER_MODEL` (the exact model ID from the gateway, including routing prefix). Keep 9Router running. For **Gemini**, set `TRANSLATE_PROVIDER=gemini`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL`. Check your provider's quota and pricing.
2. In `frontend`, run `pnpm dev` and open the printed **localhost** URL. Alternatively run `pnpm build` then `pnpm preview` locally. Restart after changing environment variables.
3. Open **Translate**, enter English text and optional context, choose a mode and translate. Review/edit any entry and click **Add to Vocab**. Only that entry is persisted via the existing IndexedDB repository, with duplicate and storage checks. Other results remain temporary, including when switching tabs, and disappear on reload. No database migration is needed.

Only submitted text, context and mode go to the configured provider, through 9Router when selected. The vocabulary library is never uploaded. The key stays in Vite's Node process and is not sent to the browser. No API requests are automatically retried. Cancelling ignores the result but an already submitted provider request may still be billed. 9Router uses non-streaming OpenAI-compatible chat completions; the JSON output is checked locally before display or saving. The endpoint must support `/chat/completions`.

The API middleware runs in local Vite dev/preview only and rejects non-loopback requests and foreign browser origins. Static hosting of `dist` alone cannot translate. Public deployment requires a separately secured server endpoint with abuse/spending controls; do not expose Vite preview publicly. No authentication or cloud database is added.

References: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [API key safety](https://ai.google.dev/gemini-api/docs/api-key).

## Translation usage limits

The local endpoint enforces 20 AI attempts per browser/day, 100 per IP/day, 1,000 across the app/day, and a 10-second cooldown per browser and IP. Daily counters reset at midnight UTC+7. Input and context are capped at 1,000 characters each, results at 5 entries, and output at 4,096 tokens (reasoning may share this budget on some models). The positive-integer `TRANSLATE_*` settings in `.env.example` configure request and token allowances; restart Vite after changing them.

The UI reads `/api/translate/usage`, shows the effective remaining allowance (including shared IP/global caps), and disables translation during cooldown or exhaustion. The server also enforces limits on direct API calls. Valid attempts are charged immediately before contacting AI, including provider failures, timeouts, invalid AI output and requests cancelled after dispatch; malformed input, missing keys and locally rejected requests are not charged. Saving to Vocab never consumes a translation.

Only signed anonymous cookie identifiers and hashed IP counters are stored in `.translate-usage/limits.sqlite` at the repository root, outside `frontend`. This private file is ignored by Git and blocked from Vite's file serving. It contains no vocabulary, prompts, responses or API keys. SQLite uses Node 24's built-in `node:sqlite`; no cloud database is required. Counters persist across restart. A storage failure blocks AI dispatch instead of bypassing the limits.

Clearing cookies resets the browser identity but not the shared IP/global allowance. Multiple people on one network share the IP allowance; localhost clients all share the local IP allowance. This remains a local-only endpoint. Public deployment still requires a proper server and trusted proxy/IP handling; these anonymous counters do not establish a person's identity.
