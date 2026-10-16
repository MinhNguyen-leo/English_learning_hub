# Full local backup and restore

Open **Data Management** in the main navigation. Choose **Export Full Backup** to download a JSON file. Save drafts first: only committed IndexedDB data is exported. Browser storage can be erased by clearing site data, private browsing, storage eviction or browser removal. Keep downloaded backups outside browser storage.

To restore, choose a `.json` backup, review its export date, record counts and conflicting IDs, then select a mode:

- **Merge** retains every existing record for an ID already present and adds missing IDs. Existing flashcard/quiz sessions and settings win conflicts. Different IDs remain separate, even if the vocabulary text matches. Repeating a Merge adds no duplicate IDs.
- **Replace** replaces the complete active dataset, including empty stores in the backup. A separate confirmation dialog is mandatory. Cancel leaves data unchanged. Export the current dataset first if it should be retained.

Both modes reload learning screens and discard unsaved drafts, as explained before restoration. Close old tabs before upgrading the app and reload other tabs after restoring. Current clients reject writes from an earlier restore generation, even if restored record timestamps/revisions match their cached values. A changed local dataset invalidates an existing preview; select the file again to preview the latest conflicts.

## Version 1 file format

The root contains `application: "english-learning-hub"`, `formatVersion: 1`, `exportedAt` (UTC ISO timestamp), and `data`, containing these arrays:

- `vocabulary`: all vocabulary fields, IDs and creation/update timestamps.
- `flashcardSessions`: saved active session, revision, original card snapshots, order, index, flipped state and remembered/not-remembered marks.
- `quizSessions`: saved active quiz, revision, original target/options/correct-answer snapshots, submitted answers, index and completion state. Score and missed vocabulary are derived from these saved answers. The existing app has no separate historical quiz archive; this feature does not invent one.
- `settings`: study preferences (`id: "preferences"`, `flashcardSize`, `quizSize`). Changing the session-size selectors now persists these preferences locally. Restoring preferences changes the selectors without regenerating saved sessions.

IDs and snapshot relationships are preserved exactly. A study snapshot may refer to a word deleted from the current library; these snapshots are self-contained and remain valid. Unknown fields/stores, unsupported versions, invalid required or optional fields, malformed timestamps, repeated IDs, inconsistent progress/answers and unsupported preferences are rejected. Input remains text; JSON content is never evaluated or rendered as HTML.

JSON files are limited to **32 MiB**, with at most **100,000 records per array**, including nested question/card/review arrays. Existing field-length limits also apply. Export uses the same validation and size bounds, so it cannot silently generate a backup that this version cannot restore. Invalid existing records are reported rather than silently omitted or repaired. A valid, explicitly confirmed Replace can recover from corrupt current user records; Merge must produce a fully valid result.

## Storage upgrade and transaction safety

The existing `english-learning-hub-guest` database is upgraded additively from Dexie schema version 1 to 2. Its vocabulary table is unchanged. New stores are `flashcardSessions`, `quizSessions`, `settings` and internal `metadata`.

At startup, progress from `english-learning-hub-guest-flashcards` and `english-learning-hub-guest-quiz` is copied once into the unified database. An import marker commits in the same transaction as these copies. Failed migrations roll back and can retry. Original progress databases are retained as recovery copies and are no longer authoritative. They are not cleared by Replace or reread after successful initialization/restoration. They may increase the browser's origin storage estimate; exported JSON contains the active logical dataset rather than obsolete copies. Internal migration markers and restore generations are local coordination metadata, not portable user records.

Export reads all active stores in one read transaction. Restore validates before opening its write transaction and validates the complete planned result before any clear. A single native IndexedDB transaction covers all clears, writes and the restore generation marker. Storage/quota errors abort the entire transaction: vocabulary, progress and settings remain as they were. The app reports success only after commit. A refresh failure after commit is reported separately and requires a page reload.

The upgrade does not add authentication, a backend, network uploads or cloud storage. Excel parsing, mapping, duplicate policies and XLSX export are unchanged; their existing regression tests remain part of the full suite.

## Verification

From the repository root in PowerShell:

```powershell
Set-Location frontend
corepack pnpm lint
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm format:check
```

Targeted backup/migration/integration checks:

```powershell
corepack pnpm test src/features/backup src/db src/app/App.test.tsx
```

Tests use isolated `fake-indexeddb` databases, never the browser's real guest data. They cover export/restore/compare in existing and fresh databases, reopening storage, Vietnamese text, malformed files, unsupported versions, invalid embedded records/relationships, conflicts, idempotent Merge, Replace confirmation, late-write rollback, stale previews, stale writers, v1 migration, migration retry, download/upload UI and refreshing mounted learning views/preferences. DOM tests emulate native dialog and File APIs that jsdom does not implement; they do not replace a manual browser check of file downloads or responsive layout.
