# English Learning Hub

A vocabulary learning project planned around an Excel-like manager, XLSX import/export, flashcards, multiple-choice quizzes, offline guest storage, Supabase Auth and cloud synchronization.

**Current phase: planning and project setup only.** The frontend shows a static setup page. No vocabulary features, local database, authentication, cloud client, sync, FastAPI service or deployment are implemented.

## Requirements

- Node.js 24 LTS, version 24.14 or newer within major 24; `.nvmrc` pins the verified version 24.19.0.
- pnpm 11.25.0, pinned in `frontend/package.json`.
- No Python installation, Supabase account or credentials are needed for this phase.

If pnpm is missing and npm is available, install it with `npm install --global pnpm@11.25.0`. Node and pnpm must be on your terminal PATH. The Codex environment used its bundled Node/pnpm because this machine's regular terminal did not have Node/npm on PATH; those machine-specific paths are not project requirements.

## Local development

From the repository root:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL Vite prints (normally `http://localhost:5173`). Stop with Ctrl+C. Run all frontend commands from `frontend/`:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
```

`pnpm format` formats frontend source/configuration. `pnpm preview` serves the already built `dist/` locally; it is not a production server. `pnpm build` runs TypeScript before bundling. Commit `frontend/pnpm-lock.yaml` and use frozen installs to reproduce dependency resolution.

No unit-test runner is installed: there is no business logic in this scaffold. Introduce Vitest with the first frontend business feature and Pytest with the later FastAPI backend, following the project testing skill. Build/lint/type checks are setup checks, not feature tests.

## Environment variables

The setup runs without an env file. The root [.env.example](.env.example) documents future optional public settings. When cloud integration is implemented, copy it to `frontend/.env.local` (PowerShell: `Copy-Item .env.example frontend/.env.local` from the repository root), fill only the required real values and restart Vite. Blank entries are deliberate; they are not credentials.

Vite reads env files from the frontend project root. Every `VITE_*` value is public in the bundle. A Supabase publishable key belongs in the browser only alongside correctly configured RLS; service-role keys, database passwords and signing secrets never belong in frontend env files. Any later server secrets must use backend-only configuration. Local env files are gitignored.

## Layout and plans

- `frontend/`: React 19, TypeScript 6, Vite 8, Tailwind CSS 4, ESLint 10 and Prettier 3. See the lockfile for exact resolved versions.
- `frontend/src/app/`: application composition; future features will live under `src/features/` as they are implemented.
- [docs/PRD.md](docs/PRD.md): functional requirements, proposed limits and acceptance criteria.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): component boundaries, data flow and phased integration decisions.
- [docs/DATABASE.md](docs/DATABASE.md): proposed IndexedDB/Postgres models, RLS and sync constraints; not executable migrations.
- `AGENTS.md` and `.agents/skills/`: project development guidance.

Dexie, Supabase SDK, an XLSX parser and backend dependencies are intentionally deferred until the relevant feature requires them. No custom authentication system or AI API integration is planned.

## Deployment plan

Vercel will host the static frontend with root directory `frontend`, install command `pnpm install --frozen-lockfile`, build command `pnpm build` and output directory `dist`. Configure the pinned Node/pnpm versions and public environment values in that future deployment. Auth redirect URLs, security headers and any later SPA routing fallback must be reviewed then. Nothing is deployed in this phase.

Follow `AGENTS.md`: work on one feature at a time, validate inputs, test business behavior and stop at the end of each authorized phase.
