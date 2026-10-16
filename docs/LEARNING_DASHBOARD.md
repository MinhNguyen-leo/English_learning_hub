# Learning Dashboard

Open **Dashboard** in the main navigation. The feature reads existing IndexedDB data only; it adds no stores, migrations, dependencies, analytics, network calls or historical records.

## Metric definitions

- **Total vocabulary** counts current record IDs. Separate meanings stored under different IDs count separately.
- **New** means no flashcard review mark and no submitted quiz answer in the retained sessions. Selection alone is not study evidence.
- **Learned** means marked remembered in the retained flashcard session, with no wrong answer for that ID in the retained quiz.
- **Learning** means a recorded flashcard mark or submitted quiz answer exists but the learned rule is not met. A correct quiz answer alone does not establish mastery. Negative evidence takes precedence because session timestamps cannot establish which result is newer.
- **Quiz accuracy** is correct submitted answers divided by all submitted answers in the current saved quiz, including unfinished quizzes. Unanswered questions are excluded; no submitted answers yields an empty state, not 0%. A quiz with only wrong answers correctly shows 0%.

The vocabulary categories are mutually exclusive and sum to the current vocabulary count. Deleted vocabulary snapshots still contribute to saved-session activity and quiz accuracy, but not to current-library categories.

## Available data and limitations

The current schema has one active flashcard session and one active quiz. It has no SRS records, due dates, review timestamps, historical quiz archive or dated study events. Therefore **reviews due today is unavailable**, rather than an invented zero. Recent activity displays the retained session summaries and clearly explains that they cannot be dated or ordered. Historical progress shows an unavailable state instead of a fabricated trend chart. Vocabulary creation/update dates are not used as study dates.

The current progress meter describes the learned rule above, not lifetime mastery. Restarting flashcards or replacing a session can decrease counts because discarded evidence is not retained. This dashboard does not introduce an SRS system or reconstruct lost history.

## Queries and refresh

The dashboard repository reads only vocabulary primary keys and the two active session records in one consistent readonly transaction. Existing progress validators and quiz scoring logic are reused. Metric calculation uses sets/maps and linear passes. Full vocabulary text records are not loaded for counting. Dexie live queries update the visible dashboard on committed changes, including changes from another connection and backup restores. Navigating away unsubscribes; returning reads current data. Read errors clear displayed metrics and offer Retry without modifying user data.

Feature code is in `frontend/src/features/dashboard/`; `frontend/src/app/App.tsx` adds navigation. Business calculations are independent of React and IndexedDB.

## Verify

From `frontend/`:

```powershell
corepack pnpm test src/features/dashboard
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

Tests cover empty libraries, unreviewed selections, conflicting marks/answers, deleted snapshots, duplicate IDs/separate meanings, zero/no/partial/completed quiz accuracy, restart behavior, unavailable SRS/history, persistence across reopen, atomic reads/subscription updates, corrupt progress, storage failures and UI retry/unsubscribe behavior. IndexedDB tests use isolated fake databases; DOM tests use jsdom. Manual browser layout verification is separate.
