# Architecture

Status: proposed architecture; only the frontend setup exists in this phase. No database, auth client, sync worker or backend is implemented.

## Runtime boundaries

- React + strict TypeScript render the browser UI. Vite builds static assets; Tailwind CSS 4 integrates through `@tailwindcss/vite` and a CSS import. ESLint and Prettier are development tooling.
- Dexie will own browser IndexedDB transactions and versioned migrations. Guest data remains local. Signed-in data uses a separate account scope and an outbox for pending cloud writes.
- Supabase Auth owns identity, passwords, sessions and recovery. Supabase Postgres holds private user data, guarded by RLS. The browser will use a public publishable key and the user's access token, never a privileged key.
- FastAPI is deferred. It will handle server-only operations only when needed; it must verify Supabase JWT signature, issuer, audience and expiry and authorize resources. It must not issue a parallel identity system. Ordinary user operations should retain the user's RLS context rather than bypass it with a service role.
- Vercel is the planned frontend host: project root `frontend`, build `pnpm build`, output `dist`. No deployment is configured or executed now. Add SPA rewrites only if client-side routes are later introduced.

## Source structure

Current: `frontend/src/main.tsx` bootstraps `src/app/App.tsx`; `src/index.css` loads Tailwind and minimal global styling.

As features are authorized, use this structure without creating empty placeholders now:

```text
frontend/src/
  app/                  application composition and future routing
  features/
    vocabulary/         table, forms, validation and vocabulary services
    spreadsheet/        XLSX mapping, validation and file handling
    flashcards/         session logic and UI
    quiz/               generation, scoring and UI
    auth/               Supabase Auth integration
    sync/               outbox, conflict handling and status
  shared/
    ui/                 components with demonstrated shared use
    domain/             shared entity types and validation contracts
    storage/            Dexie schema and repository implementations
    cloud/              Supabase adapter and boundary validation
```

Keep domain functions independent of React and I/O. Features call repositories/services, not database APIs inside presentation components. Keep feature-only helpers beside their feature; introduce shared abstractions only when used. React local state and hooks are the default; do not install routing, state-management or UI frameworks until needed.

## Data flows

### Guest edits and learning

UI input → domain validation → repository → Dexie transaction → committed local record → UI update. Do not announce a successful save before the transaction commits. Flashcards and quizzes read a snapshot of active local words and operate without network access. Storage denial/quota/upgrade failures show actionable errors, preserving the last committed state.

### File operations

File → size/type checks → workbook parser → mapped plain values → row and duplicate validation → preview → user confirmation → one Dexie transaction. Invalid files never partially commit. Export reads a consistent deck snapshot and emits explicit string cells. Select a maintained XLSX library and evaluate browser cost/security during that feature, rather than adding it now.

### Authentication and guest copy

UI → Supabase Auth SDK → provider-managed session → account-scoped local repository. Guest records are never automatically uploaded. After an explicit copy choice, generate account-owned destination IDs and store a guest-to-account mapping and outbox entries atomically. Retry reuses that mapping. Preserve guest records; another account gets its own mapping and cache.

### Synchronization proposal

1. An account edit atomically writes its local record and a pending mutation. Capture the last known server revision as the mutation's base revision. Coalesce unsent edits per record where safe; retain durable operation IDs for retries.
2. With a valid session and network, push mutations for that same account in parent-before-child order. A later transactional Postgres RPC checks ownership, expected revision and idempotency key, applies the mutation, increments the revision and acknowledges the operation. Payloads and replies are validated; client timestamps do not decide conflicts.
3. A revision mismatch retains both local and remote content and marks a conflict. The learner chooses a version (or edits a merged version); the resulting write uses the newly fetched base revision. A deletion is a versioned tombstone and may also conflict.
4. For the initial small-project implementation, pull a complete paginated account snapshot, including tombstones, after pushes. Read pages within a consistent server snapshot using the future RPC; a failed or incomplete download does not advance local state. Merge only after all pages arrive; pending local edits are never blindly replaced. Incremental change feeds are deferred until needed.
5. Lost acknowledgements retry the same operation ID and receive the stored result. Network/service failures retain local state and retry with bounded backoff and visible status. Session expiry pauses pushing. Account switch cancels in-flight work, and handlers verify the active account before applying responses.

No Realtime dependency is required initially. Tombstones and idempotency records are retained until an explicit retention/compaction protocol can prove offline clients will not resurrect data.

## Security and configuration

All `VITE_*` values are bundled public data. The root `.env.example` documents future optional public values; copy it to `frontend/.env.local` only when needed. The setup page requires no environment configuration and makes no cloud requests.

RLS enforces owner-only CRUD, immutable ownership and same-owner parent relationships. Parameterize server queries, allowlist dynamic identifiers, validate external payloads and never render vocabulary as raw HTML. IndexedDB is not a security boundary against scripts running in the origin; minimize third-party scripts and avoid logging tokens/content. Review deployment security headers and auth redirect URLs during deployment work.

## Validation strategy

This phase runs TypeScript, ESLint, production build and formatting checks; no business logic exists to unit-test. Later use Vitest for pure validation, import, quiz and sync behavior; test Dexie with an appropriate IndexedDB environment and real browser checks. Test Supabase constraints/RLS with two users and unauthenticated access. Introduce Pytest with FastAPI. Use isolated fixtures and controlled time/randomness; never test against production data.

## Decisions deferred

XLSX library choice, auth provider configuration, UI design, exact sync RPC/migration implementation, retention policy, test infrastructure, browser support verification and deployment credentials are deliberately deferred to their authorized phases.
