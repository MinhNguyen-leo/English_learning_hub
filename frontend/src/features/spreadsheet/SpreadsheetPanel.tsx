import { useState } from 'react'
import {
  duplicateKey,
  fieldNames,
  fields,
  type Field,
  type Vocabulary,
} from '../vocabulary/model'
import { planImport, type DuplicatePolicy } from '../vocabulary/importPlan'
import type { VocabularyRepository } from '../vocabulary/repository'
import {
  autoMapping,
  exportXlsx,
  mappingErrors,
  previewRows,
  type ColumnMapping,
  type ParsedSheet,
  type PreviewRow,
} from './xlsx'
import { downloadXlsx, readUpload } from './browser'
import { ExcelTemplatePreview } from './ExcelTemplatePreview'
import { templateExamples } from './template'
import './spreadsheet.css'

interface Preview {
  rows: PreviewRow[]
  snapshot: Vocabulary[]
}
const PAGE_SIZE = 50
export default function SpreadsheetPanel({
  repository,
  onClose,
  onImported,
}: {
  repository: VocabularyRepository
  onClose: () => void
  onImported: (rows: Vocabulary[]) => void
}) {
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [policy, setPolicy] = useState<DuplicatePolicy>('skip')
  const [skipInvalid, setSkipInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [templateOpen, setTemplateOpen] = useState(false)
  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await operation()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Excel operation failed. Retry without closing your preview.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function upload(file: File) {
    await run(async () => {
      const parsed = await readUpload(file)
      setSheet(parsed)
      setMapping(autoMapping(parsed.headers))
      setPreview(null)
      setSkipInvalid(false)
      setPage(0)
      setStatus('Workbook loaded. Map columns, then preview before importing.')
    })
  }
  async function makePreview() {
    if (!sheet || !mapping) return
    await run(async () => {
      const rows = previewRows(sheet, mapping)
      const snapshot = await repository.list()
      setPreview({ rows, snapshot })
      setPage(0)
      setSkipInvalid(false)
      setStatus('Preview ready. Nothing has been saved.')
    })
  }
  const mappingIssues =
    mapping && sheet ? mappingErrors(mapping, sheet.headers.length) : []
  const valid = preview?.rows.filter((row) => !row.errors.length) ?? []
  const invalidCount = (preview?.rows.length ?? 0) - valid.length
  const plan = preview
    ? planImport(
        valid.map((row) => row.input),
        preview.snapshot,
        policy,
      )
    : null
  const seen = new Set(preview?.snapshot.map(duplicateKey))
  const annotated =
    preview?.rows.map((row) => {
      const key = duplicateKey(row.input)
      const duplicate = !row.errors.length && seen.has(key)
      if (!row.errors.length) seen.add(key)
      return { ...row, duplicate }
    }) ?? []
  const pages = Math.max(1, Math.ceil(annotated.length / PAGE_SIZE))
  const ignored =
    sheet && mapping
      ? sheet.headers.filter(
          (_, index) => !Object.values(mapping).includes(index),
        ).length
      : 0
  function close() {
    if (
      sheet &&
      !window.confirm(
        'Close Excel tools and discard this import preview? No imported data has been saved.',
      )
    )
      return
    onClose()
  }
  return (
    <section className="spreadsheet-panel" aria-labelledby="excel-heading">
      <h2 id="excel-heading">Excel import and export</h2>
      <p>
        Upload a macro-free .xlsx file, up to 5 MiB, with headers in row 1. Only
        the first worksheet is used: at most 5,000 data rows (including blanks)
        and 64 columns. Formula cells are invalid and never evaluated.
      </p>
      <p>
        Template and export contain all eight vocabulary text fields. Internal
        IDs and timestamps are omitted. Export includes the entire saved
        library, regardless of table filters.
      </p>
      <fieldset disabled={busy}>
        <div className="toolbar">
          <button
            aria-expanded={templateOpen}
            aria-controls="excel-template-preview"
            onClick={() => setTemplateOpen((open) => !open)}
          >
            {templateOpen ? 'Hide Excel template' : 'Preview Excel template'}
          </button>
          <button
            onClick={() =>
              void run(async () => {
                downloadXlsx(exportXlsx([]), 'vocabulary-template.xlsx')
                setStatus('Blank template downloaded.')
              })
            }
          >
            Download blank template
          </button>
          <button
            onClick={() =>
              void run(async () => {
                downloadXlsx(
                  exportXlsx(templateExamples),
                  'vocabulary-example.xlsx',
                )
                setStatus(
                  'Example workbook downloaded. Replace the example rows with your own vocabulary before importing.',
                )
              })
            }
          >
            Download example workbook
          </button>
          <button
            onClick={() =>
              void run(async () => {
                const rows = await repository.list()
                downloadXlsx(exportXlsx(rows), 'vocabulary.xlsx')
                setStatus(`Exported ${rows.length} entries.`)
              })
            }
          >
            Export all vocabulary
          </button>
          <button onClick={close}>Close Excel tools</button>
        </div>
        {templateOpen && <ExcelTemplatePreview />}
        <label className="upload-label">
          XLSX file
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (
                file &&
                (!sheet ||
                  window.confirm('Replace the current import preview?'))
              )
                void upload(file)
            }}
          />
        </label>
        {sheet && mapping && (
          <>
            <h3>1. Map columns — {sheet.name}</h3>
            {sheet.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>
              Map Word and at least one meaning. Optional fields may be ignored.
              Source column letters distinguish repeated headers. {ignored}{' '}
              unmapped columns will be ignored; formulas and invalid cell types
              still mark a row invalid.
            </p>
            <div className="column-mapping">
              {fieldNames.map((key) => (
                <label key={key}>
                  {fields[key].label}
                  <select
                    aria-label={`Map ${fields[key].label}`}
                    disabled={preview !== null}
                    value={mapping[key] ?? ''}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        [key]:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  >
                    <option value="">Do not import</option>
                    {sheet.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {columnLabel(index)}: {header || '(blank header)'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {mappingIssues.length > 0 && (
              <ul>
                {mappingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {!preview && (
              <button
                disabled={mappingIssues.length > 0}
                onClick={() => void makePreview()}
              >
                Preview import
              </button>
            )}
          </>
        )}
        {preview && plan && (
          <>
            <h3>2. Review and import</h3>
            <p>
              {valid.length} valid rows; {invalidCount} invalid rows;{' '}
              {plan.duplicates} duplicate rows (within this file or the saved
              library).
            </p>
            <label>
              Duplicate handling
              <select
                aria-label="Duplicate handling"
                value={policy}
                onChange={(event) =>
                  setPolicy(event.target.value as DuplicatePolicy)
                }
              >
                <option value="skip">Skip duplicates</option>
                <option value="replace">Replace duplicates</option>
                <option value="keep">
                  Keep duplicates as separate entries
                </option>
              </select>
            </label>
            <p>
              Duplicates match word, part of speech, English meaning and
              Vietnamese meaning after Unicode NFC normalization, trimming and
              lowercasing. Skip keeps the first entry. Replace updates all
              matching entries, preserves their IDs and creation dates, and uses
              the last valid file row. Empty optional fields in replacement rows
              clear saved values. Keep creates a separate entry for every valid
              row.
            </p>
            <p>
              Planned changes:{' '}
              {plan.writes.filter((write) => !write.original).length} additions,{' '}
              {plan.writes.filter((write) => write.original).length} existing
              entries replaced, {plan.skipped} duplicate rows skipped.
            </p>
            {invalidCount > 0 && (
              <label className="invalid-consent">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(event) => setSkipInvalid(event.target.checked)}
                />{' '}
                Import valid rows only and skip {invalidCount} invalid rows
              </label>
            )}
            <div
              className="table-scroll"
              role="region"
              aria-label="Import preview"
              tabIndex={0}
            >
              <table>
                <caption>
                  Import preview with original worksheet row numbers
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    {fieldNames.map((key) => (
                      <th scope="col" key={key}>
                        {fields[key].label}
                      </th>
                    ))}
                    <th scope="col">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {annotated
                    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                    .map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        {fieldNames.map((key: Field) => (
                          <td key={key}>{row.input[key] || '—'}</td>
                        ))}
                        <td>
                          {row.errors.length
                            ? `Invalid: ${row.errors.join(' ')}`
                            : row.duplicate
                              ? `Duplicate: ${policy}`
                              : 'Valid: new entry'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!annotated.length && <p>No nonblank data rows were found.</p>}
            <div className="toolbar">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous rows
              </button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <button
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next rows
              </button>
            </div>
            <div className="toolbar">
              <button
                onClick={() => {
                  setPreview(null)
                  setError('')
                  setStatus('Adjust mapping, then preview again.')
                }}
              >
                Change mapping
              </button>
              <button onClick={() => void makePreview()}>
                Refresh preview
              </button>
              <button
                disabled={
                  !plan.writes.length || (invalidCount > 0 && !skipInvalid)
                }
                onClick={() =>
                  void run(async () => {
                    const rows = await repository.importEntries(
                      valid.map((row) => row.input),
                      policy,
                      preview.snapshot,
                    )
                    onImported(rows)
                  })
                }
              >
                Confirm import
              </button>
            </div>
            <p>
              No entries change until Confirm import succeeds. All planned
              changes are committed in one transaction. If the library changes,
              refresh this preview first.
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status">{busy ? 'Processing Excel file…' : status}</p>
    </section>
  )
}
function columnLabel(index: number) {
  return index < 26
    ? String.fromCharCode(65 + index)
    : String.fromCharCode(64 + Math.floor(index / 26)) +
        String.fromCharCode(65 + (index % 26))
}
