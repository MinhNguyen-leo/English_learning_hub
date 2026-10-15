# English Learning Hub — Product requirements

Status: proposed product scope. This phase delivers planning and a frontend scaffold only; the requirements below are acceptance targets for later phases, not implemented capabilities.

## Purpose and users

Help an individual learner maintain English vocabulary and practise recall. A guest can work locally without an account; an authenticated learner can synchronize a private library across devices through Supabase. Initial interface language is English; vocabulary content supports Unicode, including Vietnamese translations.

## Functional requirements and acceptance criteria

### Vocabulary manager

- Organize words into named decks. Each word has a required term and meaning, optional pronunciation, part of speech, example and notes.
- Provide an Excel-like editable table: add/edit rows, select rows, delete with confirmation, search and sort. Spreadsheet formulas, cell formatting and full Excel compatibility are outside the MVP.
- Acceptance: valid edits persist after reload; invalid required fields display accessible errors and do not overwrite saved values. Search matches term/meaning without case sensitivity. Sorting is stable. Tab navigation reaches editable controls; narrow screens contain horizontal scrolling within the table.
- Proposed limits: deck name 1–100 trimmed characters, term 1–200, meaning 1–2,000, pronunciation/part of speech up to 200 each, example/notes up to 5,000 each. Preserve original case and Unicode. Identical term/meaning pairs in a deck are rejected using trimmed, Unicode NFC, case-folded comparisons; a term may have different meanings.

### XLSX import/export

- Import `.xlsx` into a chosen deck. Headers: `term`, `meaning`, `pronunciation`, `part_of_speech`, `example`, `notes`; only the first two are required. Header matching trims whitespace and ignores case. Use the first worksheet and explain this choice before commit.
- Preview validated rows and row-numbered errors before saving; skip completely blank rows. Reject duplicate headers, invalid cell types, formulas in mapped cells and duplicates within the file or destination deck. Ignore unknown columns with a warning.
- Proposed limits: 5 MiB input and 5,000 nonblank rows; reject over-limit files before commit. Reject damaged or unsupported workbooks with a useful message.
- Acceptance: cancel or any validation/storage failure leaves the deck unchanged. A valid confirmed import commits all rows in one local transaction. No workbook formulas or macros execute.
- Export the selected deck with the same headers and text cells, including strings starting with formula characters. Acceptance: Unicode and all supported fields survive an export/import round trip into an empty deck; empty exports contain headers. Internal IDs, account identifiers and credentials are excluded.

### Flashcards

- Study a chosen deck, reveal the meaning and move through a session. Offer original order and shuffled order; shuffling is controllable in tests.
- Acceptance: every active word appears once per session; reveal does not advance the card. Empty decks have an explanatory state, single-word decks work, and editing/deleting a word does not break an already captured session snapshot. Advanced spaced repetition is deferred.

### Multiple-choice quizzes

- Prompt with an English term and offer four distinct meanings, exactly one correct. Choose distractors only from the selected deck; exclude records with the same normalized term as the prompt to avoid ambiguous answers.
- Acceptance: only words with at least three eligible distinct distractor meanings become questions. If none qualify, explain the minimum data needed. Each question accepts one answer, presents feedback, and contributes once to a final score. Session size is bounded by eligible words; no repeat prompts. Results show correct/total and permit restart. Sessions use an immutable content snapshot.

### Guest mode

- Store decks/words in IndexedDB through Dexie, without sign-in or cloud requests. Flashcards, quizzes and file operations use local data.
- Acceptance: committed data survives reload in the same browser profile; storage errors are visible and never reported as success. In an already loaded app, local operations work while disconnected. Clearing browser data removes local records; explain this limitation and offer export when the feature exists. Offline cold starts/service-worker caching are deferred.

### Authentication and cloud synchronization

- Use Supabase Auth email/password flows, including sign-up, sign-in, sign-out and provider-managed recovery. No custom password storage or token issuance.
- Acceptance: pending, invalid credentials, expired session and unavailable service have usable states. Guest mode remains available without cloud configuration; auth is unavailable with an explanation when it is not configured.
- On sign-in, explicitly offer to copy guest decks to the account or keep them local. Preserve the guest source, reuse a per-account migration mapping on retry, and avoid duplicate imports. Never silently associate guest data with an account.
- Persist authenticated changes locally and queue synchronization; show pending, synced, failed and conflict states. Cloud access is private to the authenticated owner.
- Acceptance: two devices converge after successful synchronization; retries do not duplicate records. Concurrent edits trigger explicit conflict resolution rather than silent overwrite. Sign-out/account switch immediately hides the previous account's cache and pending changes; queued work never uploads under a different account. Session expiry pauses cloud work while retaining local changes.

## Quality and security

- TypeScript strict mode; validate untrusted forms, files and cloud payloads. Business logic receives behavior and boundary tests when implemented (Vitest frontend, Pytest for the later backend).
- Semantic HTML, keyboard operation, visible focus, labeled controls and accessible errors; target WCAG 2.2 AA. Support phone and desktop layouts. Include loading, empty and error states where applicable.
- Never place privileged credentials in frontend code. Supabase RLS and ownership constraints protect every cloud table; verify isolation with two ordinary accounts and an unauthenticated client.
- Use explicit migrations and preserve local data on upgrade. No destructive database operations without explicit approval. No AI API integration.
- Proposed capacity target: a 5,000-word deck; profile table interaction and import work during that feature phase and optimize from evidence.

## Delivery boundaries

1. Current phase: these documents, React/TypeScript/Vite scaffold, Tailwind, ESLint, formatting, environment example and successful setup checks.
2. Later, separately authorized: local vocabulary storage/manager, XLSX, flashcards, quizzes, Supabase Auth/sync, then FastAPI as needed. Complete one feature at a time; this ordering is a proposal, not authorization to proceed.

Not in current scope: features, database migrations, cloud projects, deployment, a custom auth system, collaboration, AI generation, analytics, spaced repetition or a full spreadsheet engine.
