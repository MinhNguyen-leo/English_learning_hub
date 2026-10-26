# Security and deployment

Vocabulary stays in IndexedDB. XLSX imports reject formulas/macros and enforce file,
expanded archive and row limits. Render imported text and AI responses through React
text nodes; never pass them to `innerHTML`, `dangerouslySetInnerHTML` or `eval`.
IndexedDB is not encrypted: scripts executing on this origin can access it. Keep
backups private and use a trusted browser profile.

## Secrets

Keep API keys in `frontend/.env.local` for the existing local translation server.
Never prefix credentials with `VITE_`: Vite exposes those variables to browsers.
Configuration now rejects nonempty public variable names containing KEY, TOKEN,
SECRET, PASSWORD, CREDENTIAL or PRIVATE. This is a guardrail, not a complete secret
scanner: a secret placed under an innocuous name or directly in source still leaks.
Do not log keys or include them in screenshots, bundles or Git history. Rotate any
previously exposed key at the provider.

Static production builds do not contain the local translation middleware. Do not
publish Vite's dev/preview server as an API. A future Cloudflare Worker must use
Worker Secrets and independently implement request validation, abuse controls and
security headers. Adding a production backend requires separate approval.

## Headers

`frontend/public/_headers` is copied to `dist/_headers` and applied by Cloudflare
Pages to static responses. Other hosts need equivalent response header rules;
Pages Functions/Workers must set their own response headers. `vite preview` reuses
the static policy for local verification. Development uses basic headers only,
because Vite injects scripts/styles and uses WebSocket hot reload.

CSP allows same-origin scripts, fetches and XLSX workers, Google Fonts styles and
fonts, and inline styles required by the existing UI. Inline scripts and eval are
blocked. Frames, plugins and base URL changes are blocked. Browser-to-provider AI
requests are blocked by `connect-src 'self'`; server-side calls are unaffected.
HSTS applies over HTTPS. Verify headers on the deployed HTML, assets, errors and
fallback routes with browser Network tools or `curl -I` before release.

## Release controls

GitHub Actions `Security and quality` runs lint, typecheck, tests, build and dependency
audits on pull requests and pushes to main/master. High/critical advisories fail CI.
The frontend installs its pnpm lockfile with lifecycle scripts disabled. The root
npm lockfile is audited separately. Review advisories and lockfile changes before
upgrading; do not apply forced fixes automatically.

Account administrators must enable 2FA for GitHub and Cloudflare, protect the
production branch with required `verify` checks/reviews, and restrict deployment
to that branch. The workflow does not configure account settings or deploy.
Give deployment tokens only the required project/account permissions and store
them in the deployment platform secret store. Never pass production keys to PR CI.

References:
- https://vite.dev/guide/env-and-mode.html
- https://developers.cloudflare.com/pages/configuration/headers/
