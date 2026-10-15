# Phase 6: rule-based vocabulary quiz

Open **Quiz** in the feature navigation. Choose 10, 20, 50, or all eligible questions, then start. Generation reads the current `VocabularyRepository` and stores the complete question/option snapshot before showing a quiz. Existing vocabulary, Excel import/export, and flashcard logic are unchanged.

## Question rules

- Targets must pass vocabulary validation, have a meaningful nonblank English definition, and have a nonblank normalized word and ID. Invalid records and Vietnamese-only definitions are excluded. A normalized target word appears at most once, even if multiple records have different parts of speech or meanings.
- English meanings are the answer text. Each question has exactly four options: the target's definition plus three distinct distractors from saved records. Both target order and answer positions are shuffled with an injectable random source.
- Normalization uses Unicode NFKC, lowercase, punctuation/symbol removal and collapsed whitespace. Meaning comparison additionally removes a small set of function words, canonicalizes known synonym terms, compares token containment and high token overlap, and checks alternatives separated by commas, semicolons, slashes, pipes, newlines or `or`.
- A built-in synonym table and comma/semicolon/slash/pipe/newline-separated `synonyms` declarations form bidirectional, transitive word families. Distractors cannot come from the target family. All known definitions of the same word and synonym family are treated as potentially correct answers and excluded. Declared synonym text is also checked against candidate meanings. Matching nonblank Vietnamese translations are treated conservatively as equivalent.
- Distractors are checked against each other for equivalent meanings, synonym families and matching translations. Preference tiers are: same part of speech plus shared tag; same part of speech; shared tag; remaining safe records. Common abbreviations (`n.`, `v.`, `adj.`, etc.) are recognized. The current schema has no tags field; explicit `#tags` in notes supply optional related-topic hints without a schema change.
- These are deterministic, conservative rules. They cannot establish arbitrary semantic equivalence or recognize every unlisted synonym/paraphrase. Clear definitions and accurate synonym declarations improve safety; ambiguous-looking choices are excluded even when this reduces the eligible pool. No language model, AI API or external dictionary service is called.
- Targets without three safe distinct distractors are skipped. If fewer targets qualify than requested, all qualifying generated targets are used and the UI explains the shorter quiz. If none qualify, a visible error explains the minimum vocabulary needed; no invalid session replaces saved progress.

## Answering and review

Selecting a radio option immediately submits it, locks that question's answer, reveals the correct option with text feedback and computes the score once. After the answer saves successfully, the quiz automatically advances after 1.5 seconds for a correct answer or 2.5 seconds for an incorrect answer, with a matching shrinking time bar. Leaving the Quiz tab pauses the timer; returning restarts the corresponding feedback delay. A failed save does not advance; click the selected option again to retry. Questions cannot be skipped forward before answering. Previous/Next review the same captured questions and answer positions; editing/deleting vocabulary elsewhere does not alter them. Manual navigation cancels pending auto-advance; previously answered questions do not auto-advance when reviewed or restored after reload.

After the last answer, results appear automatically after the same correctness-dependent feedback delay, showing correct/total and a missed-vocabulary list with English and Vietnamese meanings. Finish quiz remains available for immediate manual navigation. Review answers preserves all submissions and scores. Starting a new quiz explicitly confirms replacement of the saved quiz. A failed-save selection is held in memory for retry; submitted answers and review navigation are persisted.

## IndexedDB

`QuizProgressRepository` separates UI from storage. `IndexedDBQuizProgressRepository` uses the new guest-only database `english-learning-hub-guest-quiz`, version 1, with an `active` record in `sessions`. Existing database schemas are unchanged.

The snapshot stores schema version, requested size, eligible count, targets/options/correct indices, submitted choices, position and completion status. Score and missed vocabulary are derived from the answers. Every saved snapshot is validated, including option distinctness, target uniqueness, legal answer ranges and contiguous submissions. Revision comparisons run inside read/write transactions to reject concurrent changes from another tab.

A failed save keeps the selected answer and last committed score available for retry. Invalid saved data is reported without overwriting it. Saved quizzes resume without regenerating questions or requiring a fresh vocabulary read. Clearing browser storage removes quiz progress. Authentication/cloud synchronization remain deferred.

## Files and verification

- `frontend/src/features/quiz/generator.ts`: standalone generation and ambiguity filtering.
- `session.ts`: immutable submission/navigation transitions, results and saved-state validation.
- `progressRepository.ts`: versioned IndexedDB persistence and conflict/error handling.
- `Quiz.tsx`, `quiz.css`: quiz setup, accessible answer controls, feedback and review UI.
- `frontend/src/app/App.tsx`: Quiz navigation and repository composition; views stay mounted to preserve drafts/selections.
- `generator.test.ts`, `session.test.ts`, `progressRepository.test.ts`, `Quiz.test.tsx`: fixed-seed determinism, sizes, distractor rules, synonyms, normalized duplicates, navigation/scoring, insufficient data, persistence after reopening, rollback/retry, corruption/conflicts, feedback and completed review. `testSupport.ts` supplies deterministic fixtures and a fixed-seed random source.

Run from `frontend/`: `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm format:check`. Tests use Vitest, fake-indexeddb and jsdom. Real-browser visual/storage compatibility checks remain manual.

Stop after Phase 6. No later-phase features or additional dependencies were added.

