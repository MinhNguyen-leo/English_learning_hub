# Phase 5: flashcards

The Flashcards navigation button opens a study view alongside the existing vocabulary manager. Both views stay mounted after opening, preserving vocabulary drafts and the current session when switching views. Excel import/export is unchanged.

## Study behavior

- Vocabulary is read through the existing `VocabularyRepository.list()` interface. Choose 20, 50, or all available entries. Fisher–Yates shuffling followed by slicing samples without replacement by entry ID; different meanings with different IDs remain separate cards. If fewer entries exist, all available entries are used. Empty libraries show an explanation and cannot start a session.
- A new session copies its selected records. The front shows the word; the back shows English meaning, Vietnamese meaning, part of speech, and example sentence. Missing optional values show `Not provided`.
- Flip does not advance. Previous/Next stay within bounds and show the front when moving to another card. Each selected card has one current review mark: remembered, not remembered, or unreviewed. Changing a mark replaces its previous classification. Counts and completion update without double-counting; cards do not auto-advance when marked.
- Shuffle reorders only the current selection, returns to its first card/front, and preserves review marks by ID. Restart returns to the first card/front and clears review marks, retaining the same selection and order; clearing marks requires confirmation.
- Start new session explicitly replaces the saved session after confirmation and samples from a fresh repository read. Changing the size selector or refreshing available words does not change the active session. Repository edits/deletions do not modify its captured card content.

## Local persistence

`ReviewProgressRepository` isolates study persistence from UI and vocabulary CRUD. Its Dexie implementation uses a separate guest-only database, `english-learning-hub-guest-flashcards`, schema version 1, with an `active` record in `sessions`. The existing vocabulary database/schema is unchanged.

Stored data includes a versioned session snapshot, selected cards in order, current index, front/back state, review marks, and a revision counter. Each action is committed before the UI reports success. Reopening the view/browser restores the saved selection and progress rather than resampling. A failed write leaves the last committed state visible and can be retried. Atomic revision checks reject stale changes from another tab and ask the user to reload saved progress.

Stored snapshots are validated before use or replacement. Invalid/unsupported data is reported without overwriting it. Saved sessions can still be studied if the vocabulary repository is unavailable. Storage failures show visible errors, and starting a session is blocked until existing progress has been read successfully. Clearing browser storage removes review progress. No cloud services, authentication, AI calls, or service-worker offline startup were added.

## Files and verification

- `frontend/src/features/flashcards/session.ts`: deterministic session transitions, sampling, review counts, and persisted-state validation.
- `progressRepository.ts`: versioned Dexie storage, validation, and transactional conflict detection.
- `Flashcards.tsx` and `flashcards.css`: responsive UI, loading/empty/error states, and controls.
- `frontend/src/app/App.tsx`: feature navigation and repository composition.
- `session.test.ts`, `progressRepository.test.ts`, and `Flashcards.test.tsx`: sampling/boundary behavior, immutable snapshots, navigation, classification changes, shuffle/restart, persistence after closing and reopening, transaction rollback/retry, corrupted state, conflicting tabs, UI resumption, and storage errors.

Run from `frontend/`: `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`, and `corepack pnpm format:check`. Tests use generated records, controlled randomness, fake-indexeddb, and jsdom. Real-browser visual and storage-compatibility checks remain manual.

Stop after Phase 5; no quiz or later-phase work is included.
