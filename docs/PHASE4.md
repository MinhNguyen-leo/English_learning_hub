# Phase 4: XLSX import and export

Open **Excel import / export** from the vocabulary manager after saving or cancelling an inline edit. The table is disabled while Excel tools are open, so a draft cannot be overwritten by an import.

## Files and mapping

- Download blank template creates a real `.xlsx` workbook with one `Vocabulary` worksheet, eight canonical headers and no sample data: `word`, `english_meaning`, `vietnamese_meaning`, `part_of_speech`, `synonyms`, `antonyms`, `example_sentence`, `note`.
- Export all vocabulary reads every saved entry from the repository, independent of search, filter and sorting. It exports those eight text fields; internal UUIDs and timestamps are excluded. Empty libraries export headers only. Clearing browser storage still removes local data; an exported file provides a portable copy of vocabulary content.
- Import accepts `.xlsx` only, uses the first worksheet, and expects headers in row 1. Other worksheets produce a warning. Limits: 5 MiB uploaded file, 5,000 physical data rows including blanks, 64 columns, 512 archive entries, and 32 MiB declared expanded archive size. Parsing runs in a dedicated worker terminated after 15 seconds. These limits reject oversized workbooks rather than silently truncating them.
- Canonical headers auto-map after trimming, lowercasing and replacing spaces/hyphens with underscores. Other headers can be mapped manually. Repeated headers are distinguished by column letter and require explicit selection. Each source column can map to at most one field. Word and at least one meaning mapping are required; optional columns may be ignored.
- Completely blank rows are skipped. Preview preserves worksheet row numbers and reports invalid text types, formulas, required values and field lengths using the Phase 3 validator. Numbers, dates, booleans and spreadsheet errors are invalid, including in ignored columns. A formula is never accepted through its cached result. Invalid rows are excluded only after explicit consent to import valid rows. Preview is paginated in groups of 50.

## Duplicates and transactions

Duplicate identity is the tuple of word, part of speech, English meaning and Vietnamese meaning, each normalized with Unicode NFC, trim and lowercase. This also updates manual CRUD duplicate checks to include part of speech; no existing records are migrated or removed.

- **Skip** preserves the existing entry or first valid file row.
- **Replace** applies the last valid file row to every matching existing entry, preserving each UUID and creation timestamp. Optional blanks clear saved content. Repeated new file rows become one new entry with the last row's values. Preview shows replacement counts and warns about these effects.
- **Keep** creates a new UUID for every valid file row, including exact duplicates. Their optional fields can subsequently be edited inline.

The repository interface exposes `importEntries`; UI code never writes directly to Dexie. Preview loads a library snapshot. Confirmation rechecks the complete snapshot inside a read/write transaction, validates all submitted inputs again, resolves duplicates and applies every write atomically. Another tab's changes require refreshing preview. Failure rolls back all writes and keeps the preview available for retry. Cancellation never writes. No IndexedDB schema version change is needed.

## Library and spreadsheet safety

SheetJS CE 0.20.3 is pinned to the official distribution tarball with lockfile integrity, following its [framework installation instructions](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/). It is bundled locally and makes no runtime network requests. Excel tools are loaded separately from the main vocabulary UI.

The parser reads data without evaluating formulas, invoking external links or executing VBA. Macro-enabled archives are rejected, including renamed `.xlsm` files with VBA entries. Formula cells are invalid even in ignored columns. Uploaded HTML/rich text is not rendered. Export creates a fresh workbook with explicit string cells, text number formatting, and no formula or hyperlink properties. Leading `=`, `+`, `-`, `@` and whitespace remain literal text without modifying stored vocabulary.

## Verification

From `frontend/`, run `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build` and `corepack pnpm format:check`.

Tests cover malformed and renamed files, macros/formulas, blank templates, missing/custom/repeated columns, required values, file/row/column limits, Vietnamese round trips, formula-like export strings, all duplicate policies, rollback/retry, stale snapshots, persistence after reopening, upload worker behavior and UI preview/consent/cancellation/downloads. Tests use generated binary XLSX fixtures, fake-indexeddb and jsdom. Real-browser visual checks and interoperability with desktop Excel are not automated here.

Authentication, cloud synchronization and later learning phases remain out of scope.
