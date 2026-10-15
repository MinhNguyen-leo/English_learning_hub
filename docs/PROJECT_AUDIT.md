# English Learning Hub — Project Audit

Date: 2026-10-15, Asia/Bangkok. Scope: the existing guest-only, local-first application, reviewed against the current `AGENTS.md` and the actual source. This audit changes documentation only; application source, manifests, lockfiles and user data were not changed.

## Executive assessment

Vocabulary CRUD, XLSX interchange, flashcards and quizzes are implemented, with a useful separation between React UI, business logic and repositories. Transactions, stale-write protection, input validation and immutable study snapshots are substantial strengths. The normal automated verification commands pass.

The most important gaps are recovery and learning correctness: there is no complete backup/restore facility, some full-library exports cannot be reimported, malformed stored vocabulary can crash the manager, and quiz heuristics can produce semantically ambiguous choices or omit otherwise eligible questions. Passing tests currently do not cover these cases.

Priority labels below mean: **P1** = address before relying on the app as the sole copy of important data or making strong correctness claims; **P2** = important reliability/maintainability improvement; **P3** = lower-risk usability/documentation cleanup. Findings distinguish reproduced behavior from source-derived risks.

## Implemented features

### 1. Architecture and dependencies

- The application lives in `frontend/`, bootstrapped by `src/main.tsx` and composed in `src/app/App.tsx`. Feature directories contain vocabulary, spreadsheet, flashcards and quiz code. There is no backend or authentication flow.
- React local state switches views. Already-opened views remain mounted under `hidden` wrappers, preserving drafts and sessions. Quiz receives an explicit active-view flag; flashcard shortcuts check whether their view is hidden.
- Repository interfaces separate React components from Dexie. Quiz generation, flashcard sampling and session transitions are pure functions with injectable randomness.
- Actual installed versions observed: React/React DOM 19.3.0, TypeScript 6.0.3, Vite 8.3.4, Dexie 4.4.6, SheetJS CE 0.20.3, Vitest 5.0.4, ESLint 10.12.0 and Tailwind CSS 4.3.3. The frontend pins pnpm 11.25.0, declares Node `>=24.14.0 <25`, and uses a pnpm lockfile. The audit ran on Node 24.22.0; `.nvmrc` specifies 24.19.0.
- SheetJS is pinned to its distribution tarball with a SHA-512 integrity entry in `frontend/pnpm-lock.yaml`. The current app does not use ExcelJS or React Router, despite their inclusion in `AGENTS.md`.
- A separate root `package.json`/`package-lock.json` installs `@supabase/supabase-js` 2.118.0. It is not imported by the frontend; its presence does not implement cloud functionality. Root and frontend installations are separate, with no workspace configuration joining them.

### 2. IndexedDB schemas and persistence

Three independent, version-1 Dexie databases exist:

- `english-learning-hub-guest`: store `vocabulary`, primary key `id`; indexes `word`, `part_of_speech`, `updated_at`. See [vocabulary repository](../frontend/src/features/vocabulary/repository.ts).
- `english-learning-hub-guest-flashcards`: store `sessions`, primary key `id`, containing a single `active` record with revision and session snapshot. See [flashcard progress repository](../frontend/src/features/flashcards/progressRepository.ts).
- `english-learning-hub-guest-quiz`: analogous `sessions` store with an `active` quiz record and revision. See [quiz progress repository](../frontend/src/features/quiz/progressRepository.ts).

Vocabulary mutations and imports use read/write transactions. Update/delete operations compare the expected `updated_at` value within the transaction; updates increase timestamps monotonically for the record. Imports compare a complete preview snapshot before committing. Study saves compare integer revisions in transactions. Success is reported after the repository promise commits, and storage failures are surfaced. Tests exercise reopening databases, rollback, retry and stale writes.

No migrations beyond the initial schemas exist or are presently needed. There is no persistent-storage request, quota estimate UI, recoverable deleted-record store, or backup of these databases.

### 3. Vocabulary manager

- UUID records contain the requested eight text fields plus creation/update timestamps. Word and at least one English/Vietnamese meaning are required. Validation trims text, applies Unicode NFC normalization and enforces field lengths: word/part of speech 200, meanings/synonyms/antonyms 2,000, example/note 5,000.
- Add/edit/delete, double-click cell editing, keyboard editing, Shift+Enter save, explicit Save/Cancel, creation-time hover text, a searchable part-of-speech picker, search/filter/sort and empty/error/loading states are implemented.
- Duplicate identity is normalized word + part of speech + both meanings, using NFC, trim and lowercase. Different senses are allowed. Import can intentionally keep duplicates; optional fields of those duplicates remain editable.
- Deletion and abandoning a dirty draft require confirmation. Dirty drafts register a `beforeunload` warning and survive feature switching, but remain memory-only until saved.

### 4. Excel import/export

- A real blank XLSX template and full-vocabulary export contain eight text columns; internal IDs and timestamps are omitted.
- Import supports canonical/custom/repeated header mapping by column index, first-sheet-only warnings, preview pagination, original row numbers, per-row errors and explicit consent to skip invalid rows.
- Skip/Replace/Keep policies are applied transactionally and revalidated before commit. Replace preserves matching IDs/creation dates, applies the last valid duplicate row, and clears optional content when the incoming value is blank; the UI explains this.
- Limits are 5 MiB uploaded size, 5,000 physical data rows including blank rows, 64 columns, 512 ZIP entries and 32 MiB declared expanded ZIP size. Parsing runs in a worker with a 15-second timeout. Actual parsed cell addresses are inspected so a false worksheet dimension cannot silently hide later cells.
- Formula cells, including cached formulas in ignored columns, are invalid. Non-text cells and macro-related archive entries are rejected. Export writes explicit string/text cells without formula or hyperlink metadata. No formula/macro execution path or raw-HTML rendering of vocabulary was found.

### 5. Flashcards

- Fisher–Yates sampling selects 20, 50 or all entries without replacement by record ID, handles small libraries, and copies the chosen records. Different meanings of the same word may appear because they have different IDs; this matches the entry-based vocabulary model.
- Front/back content, 0.2-second flip styling, bounded Previous/Next, Space/arrow shortcuts, shuffle, restart popup and remembered/not-remembered marks are implemented.
- Navigation does not regenerate selection. Shuffle reorders only selected cards and preserves marks. Restart retains the selected cards and clears marks after confirmation. Counts are derived from one current mark per record.
- Selection/order, content snapshot, position, card side and marks persist locally. Saved study sessions remain usable when current vocabulary cannot be loaded or has changed.

### 6. Multiple-choice quiz

- Four-option generation is independent of React. It requires a usable English meaning, avoids repeated normalized target words, shuffles target/answer positions and supports 10/20/50/all generated eligible targets.
- Distractor rules use normalized text, token overlap, a small built-in synonym vocabulary, bidirectional/transitive declared synonyms, alternate senses and matching Vietnamese translations. Same part of speech is preferred; optional `#tags` in notes provide a related-topic hint. There is no separate tags field.
- Selecting an answer submits immediately, persists once, locks the answer and reveals the correct choice. Score and missed vocabulary are derived from saved submissions. The feedback bar/timer uses 1.5 seconds for correct answers and 2.5 seconds for wrong answers. The final answer advances to results. Manual review preserves scoring.
- Submitted choices, question/option snapshots, position and completion state survive reload. Generation does not rerun on navigation or resume. Conflicting-tab saves are rejected. Leaving the app's Quiz view pauses pending auto-navigation; this is not a general browser Page Visibility implementation.

### 7. Existing progress and backup/restore

Flashcards and quiz each retain **one active session**. There is no session history, cumulative per-word mastery, review schedule, progress dashboard or central progress store. Starting a new session explicitly replaces the old one after confirmation; this is current designed behavior, not evidence of an unconfirmed overwrite.

**XLSX interchange is the only available content recovery mechanism.** There is no complete application backup/export format, complete restore flow, ID-preserving restore or learning-progress restore. No `features/backup` or `features/progress` implementation exists. These are gaps against the current `AGENTS.md` backup/restore requirement; authentication and cloud sync are deliberately excluded and should remain excluded.

## Bugs and architectural risks

### A01 — P1: no full backup/restore or durable recovery path

**Confirmed from source.** `spreadsheet/xlsx.ts:255` exports text fields only. Reimport creates fresh UUIDs/timestamps and does not recreate either learning-session database. Storage clearing, origin/browser-profile changes or loss of the browser profile leave no complete recovery option. No `navigator.storage.persist()`/quota-management integration was found. A persistence request alone would not replace backups.

**Recommendation:** prioritize a versioned local backup format covering vocabulary IDs/timestamps and both study snapshots, with strict validation, a restore preview, explicit merge/replace semantics and rollback/recovery tests. Design consistency across the three databases; a transaction in one database does not make a three-database restore atomic. Add backup reminders and storage-status guidance without uploading user content.

### A02 — P1: a full-library export can be impossible to import unchanged

**Reproduced.** Exporting 5,001 valid records produced a 573,740-byte workbook, well below the upload-size limit. `parseXlsx()` rejected that same workbook at the 5,000-row limit. The vocabulary store has no total-record cap, and several imports or ordinary CRUD can legitimately exceed this threshold. Large text-heavy exports can independently encounter the 5 MiB import limit.

Evidence: [export and parsing limits](../frontend/src/features/spreadsheet/xlsx.ts), [per-import limit](../frontend/src/features/vocabulary/importPlan.ts). This does not corrupt the existing library, but undermines recovery precisely when users rely on an exported copy.

**Recommendation:** ensure all supported library sizes have a documented round-trip recovery path; use full backups or bounded multi-file/chunked exports/imports. Add a regression test at 5,001 entries and near the byte limit.

### A03 — P1: malformed stored vocabulary can make the manager unusable

**Reproduced using an isolated test database.** Insert a record whose `word` is `null`; `VocabularyRepository.list()` returns it unchecked, then `queryVocabulary()` throws while calling `.toLowerCase()`. Creation/form validation does not validate pre-existing storage. There is no application error boundary or quarantine/recovery UI to isolate this failure.

Evidence: `vocabulary/repository.ts:51`, `vocabulary/model.ts:66`, and `main.tsx`. This requires invalid local state; the normal validated CRUD path did not produce it during testing. It is a corruption/manual-edit/future-migration robustness issue, not a demonstrated remote injection exploit.

**Recommendation:** validate storage reads and metadata, isolate/report bad rows while preserving valid ones, and provide an export/recovery route instead of recommending database deletion. Validate date formats as well as text types before relying on timestamps for optimistic concurrency.

### A04 — P1 for quiz correctness: semantic ambiguity remains possible

**Reproduced.** Given `teacher → a person who educates` and `instructor → a person who instructs`, plus three unrelated records, seeded generation placed both meanings in the teacher question for seeds 3, 5 and 6, among others. `equivalentMeanings()` returns false for this pair. Both descriptions can be correct.

Evidence: `quiz/generator.ts:33`, `:79`, `:133`. The code and UI acknowledge the limitation, but a blanket guarantee of never using equivalent meanings or synonyms is not met. Token containment also over-excludes some valid distinctions, such as negation, reducing the available pool.

**Recommendation:** define an explicit supported ambiguity policy, expand tested domain/synonym rules, support excluding/reporting questionable questions, and avoid claiming semantic certainty from these heuristics. Do not introduce AI/network services without separate authorization.

### A05 — P2: greedy distractors can omit a genuinely eligible target

**Reproduced.** With target meaning `quartz` and candidate meanings `red blue`, `red`, `blue`, `green`, the rules accept the triple `red`/`blue`/`green` as mutually distinct. When the greedy loop first selects `red blue`, it excludes both `red` and `blue` and cannot obtain three distractors. Seeds 3, 8 and 9 omit the target, while seeds 1, 2 and 4 include it.

Evidence: `quiz/generator.ts:232–259`. Consequently, `eligibleCount` describes successful randomized greedy constructions, not a stable count of all targets that could have a valid triple.

**Recommendation:** use bounded backtracking or a compatibility-aware selection strategy, with deterministic tests covering this counterexample. Keep preference tiers without allowing an early choice to incorrectly eliminate eligibility.

### A06 — P2: feedback timer can diverge from its visible countdown bar

**Reproduced with fake timers.** Answer correctly, wait 1,000 ms, then change the enabled new-quiz size selector. The effect at `quiz/Quiz.tsx:113` has no dependency array, so rerender clears/restarts the 1,500-ms timeout. The existing countdown DOM node is preserved, so its CSS animation does not restart. At 1,500 ms total the question has not advanced; it advances at 2,500 ms in this reproduction.

**Recommendation:** tie both the timer and bar to the same answer/deadline identity, and limit effect rescheduling to intentional pause/resume or question changes. Add a test that changes an unrelated control during feedback.

### A07 — P2: ZIP resource limits are declared-size checks, not a hard memory bound

**Source-derived risk; no destructive memory-exhaustion test performed.** `spreadsheet/xlsx.ts:34–85` sums uncompressed sizes declared in ZIP directory metadata. SheetJS then expands/parses the workbook before worksheet row/column limits are applied. The worker and timeout are good protections for responsiveness, but do not establish a cap on actual decompressed allocations or integrity of conflicting ZIP metadata.

**Recommendation:** add adversarial ZIP fixtures and integrity checks, bound actual expanded bytes/resources where feasible, and document the distinction between declared-size checks and guaranteed resource limits. Keep parsing isolated in a worker.

### A08 — P2: offline first-use and failure recovery are incomplete

**Source-derived risk.** Warm local CRUD/study needs no server, but there is no service worker or explicit asset cache for cold offline startup. Excel tools are a lazy-loaded chunk (`VocabularyManager.tsx:16`); if it has not been loaded/cached before disconnecting, opening it cannot reliably work offline. `Suspense` provides a loading fallback, but no error boundary handles a rejected chunk import.

Invalid saved study snapshots are deliberately rejected and preserved, but the only recovery control reloads the same invalid record. There is no non-destructive recovery/export or confirmed reset flow for that condition.

**Recommendation:** add feature error boundaries and retry/recovery controls first; separately define and test the offline guarantee. Preserve recoverable data before any reset. Treat service-worker caching as a scoped follow-up, not a backend requirement.

### A09 — P2: scale and write amplification need browser measurements

**Measured/source-derived.** Generating only 10 questions from 5,000 synthetic records still calculated eligibility for all 5,000 and took approximately 1,022 ms in this audit's jsdom/Node run. This is not a mobile-browser benchmark. Generation runs on the UI thread and is quadratic in record count in the ordinary candidate-tier construction.

Vocabulary listing/search/rendering loads and renders the full library. Duplicate checks scan records rather than using a normalized compound index. Import snapshot comparison serializes the library. Study saves validate and rewrite the complete selected snapshot on flips/navigation, and all counts are unbounded by a total-library capacity.

**Recommendation:** benchmark realistic definition lengths and lower-end browsers, consider worker-based quiz generation and bounded/virtualized table rendering, and separate immutable session content from small mutable progress if measurements justify it. Add indexes through tested migrations, preserving existing records.

### A10 — P2: recovery/history, migration and ownership conventions are not consolidated

**Confirmed architecture gap.** Three repositories repeat storage-error, version and revision patterns, and progress validators depend on today's domain/generation rules. All databases are at initial version 1; no upgrade/cross-version fixtures exist. A future rule change could invalidate an old quiz snapshot without a defined recovery path. Current study IDs are record/session identifiers, not a historical mastery model.

**Recommendation:** define stable persisted contracts and upgrade fixtures before schema/rule changes. Decide whether progress is session-only or historical. Preserve guest-only behavior and explicit confirmation when replacing progress. Consolidation is optional; three databases are not inherently incorrect, but require a coordinated backup/restore design.

### A11 — P2/P3: documentation, dependency ownership and verification gaps

**Confirmed.** `README.md` and `frontend/README.md` still describe a setup-only application with no unit tests or database. Architecture/database planning documents include deferred cloud/deck designs that do not describe the shipped schemas. `AGENTS.md` lists ExcelJS/React Router; the actual app uses SheetJS/local view state. The unused root Supabase installation and second lockfile make the correct project/install root less obvious.

There is no checked-in CI workflow, browser E2E runner, configured coverage percentage/threshold, deployment security-header configuration or automated migration/backup-restore test suite. The existing part-of-speech popup, native restart dialog, 3D flip, timers and downloads are primarily checked through jsdom/mocks, not actual browsers. One vocabulary test fixture contains a replacement character in Vietnamese text; proper Vietnamese coverage exists in newer XLSX/progress tests, so the suite still has meaningful Unicode checks.

**Recommendation:** reconcile the docs with the guest-only product and choose dependency ownership deliberately; do not automatically install a router or replace the XLSX library merely to match stale text. Add CI and high-value real-browser tests, then measure branch/line coverage. Review deployment headers and origin stability when hosting is configured. Do not remove the root dependency as part of an audit-only task.

## Input/security assessment

- No runtime vocabulary upload, application `fetch`/XHR path, authentication or privileged frontend secret was found in source. The root Supabase dependency is unused. A network trace of a deployed browser session was not captured.
- React text rendering and explicit XLSX string cells provide useful safeguards against HTML/script interpretation and spreadsheet formula execution. Existing tests cover formula-looking export strings, malformed input, formula cells, macro-related entries and unexpected cell types.
- Import preview and transaction rollback prevent partial library changes. Whole-library snapshot comparison avoids silently replacing a record changed in another tab.
- Browser-local storage is not an authorization/encryption boundary against same-origin scripts or someone using the same profile. Guest-only scope is appropriate, but reliable offline recovery and safe input handling still matter. Dependency scans returning zero advisories do not prove absence of vulnerabilities or complete advisory coverage for a tarball dependency.

## Missing features and recommended priorities

### First: data recovery and trustworthy stored state

1. Implement full versioned backup/restore, including IDs/timestamps and learning progress; address export/import size asymmetry. Cover empty, large, Unicode, duplicate, corrupt-file, failed-write and restore rollback cases.
2. Add read-time vocabulary validation and non-destructive corruption recovery/error boundaries. Preserve valid records and original data for export.
3. Add persistence/quota guidance and a clear explanation of browser-profile/origin dependence. Do not clear IndexedDB as a troubleshooting shortcut.

### Next: question correctness and review timing

4. Turn the reproduced quiz paraphrase/greedy cases into permanent regression tests and define the ambiguity guarantee the offline rules can support.
5. Synchronize feedback deadlines with the countdown bar across rerenders, view changes, manual navigation and failed writes.
6. Decide whether learning progress needs history/per-word aggregation; add this only as a separately scoped feature after backup safety.

### Then: maintainability, offline behavior and release verification

7. Update README/architecture/schema/dependency guidance to match the actual application; clarify the unused root manifest without changing dependencies during this audit.
8. Add CI for the existing commands, measured coverage and real-browser tests for storage reopening, multi-tab conflicts, imports/downloads, dialogs/focus, keyboard interaction and offline lazy loading.
9. Profile 5,000+ entries and long definitions; add targeted performance improvements and tested migrations only from measured evidence.

Authentication, cloud synchronization and a backend are not missing requirements for this guest-only audit and are not recommended as fixes for these local-first gaps.

## Verification performed

All commands below were run against the installed dependencies without reinstalling, upgrading or fixing packages:

- `corepack pnpm test`: **136 tests passed in 14 files**; no failures.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed with the configured zero-warning limit.
- `corepack pnpm build`: passed; includes TypeScript and Vite production bundling. Main JS was approximately 359.74 kB / 113.56 kB gzip; XLSX feature chunk approximately 337.84 kB / 110.61 kB gzip; worker approximately 366.94 kB; background PNG approximately 1.79 MB.
- `corepack pnpm format:check`: passed.
- Frontend `corepack pnpm audit --json`: completed; **0 reported advisories** across the returned severity counts.
- Repository-root `npm audit --json`: completed; **0 reported advisories**.

Six additional audit-only probes passed by asserting the observed defects/behavior: 5,001-row export rejection, invalid-record search failure, teacher/instructor ambiguity, greedy eligibility omission, the synthetic 5,000-record timing measurement, and the quiz timer/bar reset mismatch. They ran from a temporary `frontend/audit-probes.test.tsx` with `corepack pnpm exec vitest run audit-probes.test.tsx --maxWorkers=1 --reporter=verbose`, then that audit-created file was removed. These are separate from the permanent suite's 136 tests; passing a defect probe confirms the finding rather than fixing it.

Only isolated synthetic databases named with an `audit-only-` prefix were written/deleted by those probes. No browser user database was opened or cleared. Frontend application source/configuration and manifest/lockfile SHA-256 fingerprints were compared before/after. No application-code changes were made. Normal build/cache outputs may be regenerated by verification.

Limitations: no real-browser/device visual inspection, browser storage-eviction simulation, desktop Excel compatibility run, adversarial memory-exhaustion test, deployed-network/header review or fresh frozen-lockfile reinstall was performed. Line/branch coverage was not measured and no coverage threshold is configured. `pnpm list --depth 0` encountered a sandbox store SQLite-access error; inventory was obtained from package files and the lockfile instead. This environment issue did not block tests/build or the dependency advisory scans.

## Exact commands to verify the project

PowerShell, from the repository root:

```powershell
Set-Location 'C:\Users\MINH\Documents\GitHub\English_learning_hub'
Get-Content AGENTS.md -Encoding utf8
node --version
Set-Location frontend
corepack pnpm --version
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm format:check
corepack pnpm audit --json
Set-Location ..
npm audit --json
```

For focused existing tests, run from `frontend/`:

```powershell
corepack pnpm exec vitest run src/features/vocabulary
corepack pnpm exec vitest run src/features/spreadsheet
corepack pnpm exec vitest run src/features/flashcards
corepack pnpm exec vitest run src/features/quiz
```

For a clean checkout with the required Node version, install frontend dependencies from `frontend/` with `corepack pnpm install --frozen-lockfile` before running those commands. This install was not executed during the audit. The repository root has no application test/lint/build scripts; run those scripts from `frontend/`. Advisory scans need registry connectivity and should not be run with `--fix` during an audit.

To inspect manually, run `corepack pnpm dev` from `frontend/` and use the URL Vite prints. To serve the already built application locally, use `corepack pnpm preview`. Do not delete site data, reset databases or test restore scenarios against the only copy of real vocabulary. Audit complete; recommended changes above were not implemented.
