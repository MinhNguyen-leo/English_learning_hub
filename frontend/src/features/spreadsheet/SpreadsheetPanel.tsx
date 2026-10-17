import { useUiText } from '../../lib/useUiText'
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
import { MAX_IMPORT_ROWS } from '../vocabulary/importPlan'

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
  const t = useUiText()

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
        t(
          'Close Excel tools and discard this import preview? No imported data has been saved.',
        ),
      )
    )
      return
    onClose()
  }
  return (
    <section className="spreadsheet-panel" aria-labelledby="excel-heading">
      <h2 id="excel-heading">{t('Excel import and export')}</h2>
      <p className="import-row-limit">
        <strong>
          {t(
            'Import up to {{value0}} vocabulary rows per XLSX file (excluding the header row).',
            { value0: MAX_IMPORT_ROWS.toLocaleString() },
          )}
        </strong>
      </p>
      <p>
        {t(
          'Upload a macro-free .xlsx file, up to 5 MiB, with headers in row 1. Only the first worksheet is used: at most 5,000 data rows (including blanks) and 64 columns. Formula cells are invalid and never evaluated.',
        )}
      </p>
      <p>
        {t(
          'Template and export contain all eight vocabulary text fields. Internal IDs and timestamps are omitted. Export includes the entire saved library, regardless of table filters.',
        )}
      </p>
      <fieldset disabled={busy}>
        <div className="toolbar">
          <button
            aria-expanded={templateOpen}
            aria-controls="excel-template-preview"
            onClick={() => setTemplateOpen((open) => !open)}
          >
            {templateOpen
              ? t('Hide Excel template')
              : t('Preview Excel template')}
          </button>
          <button
            onClick={() =>
              void run(async () => {
                downloadXlsx(exportXlsx([]), 'vocabulary-template.xlsx')
                setStatus('Blank template downloaded.')
              })
            }
          >
            {t('Download blank template')}
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
            {t('Download example workbook')}
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
            {t('Export all vocabulary')}
          </button>
          <button onClick={close}>{t('Close Excel tools')}</button>
        </div>
        {templateOpen && <ExcelTemplatePreview />}
        <label className="upload-label">
          {t('XLSX file')}
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
            <h3>
              {t('1. Map columns —')} {sheet.name}
            </h3>
            {sheet.warnings.map((warning) => (
              <p key={warning}>{t(warning)}</p>
            ))}
            <p>
              {t(
                'Map Word and at least one meaning. Optional fields may be ignored. Source column letters distinguish repeated headers.',
              )}{' '}
              {ignored}{' '}
              {t(
                'unmapped columns will be ignored; formulas and invalid cell types still mark a row invalid.',
              )}
            </p>
            <div className="column-mapping">
              {fieldNames.map((key) => (
                <label key={key}>
                  {t(fields[key].label)}
                  <select
                    aria-label={t('Map {{value0}}', {
                      value0: t(fields[key].label),
                    })}
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
                    <option value="">{t('Do not import')}</option>
                    {sheet.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {columnLabel(index)}: {header || t('(blank header)')}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {mappingIssues.length > 0 && (
              <ul>
                {mappingIssues.map((issue) => (
                  <li key={issue}>{t(issue)}</li>
                ))}
              </ul>
            )}
            {!preview && (
              <button
                disabled={mappingIssues.length > 0}
                onClick={() => void makePreview()}
              >
                {t('Preview import')}
              </button>
            )}
          </>
        )}
        {preview && plan && (
          <>
            <h3>{t('2. Review and import')}</h3>
            <p>
              {valid.length} {t('valid rows;')} {invalidCount}{' '}
              {t('invalid rows;')} {plan.duplicates}{' '}
              {t('duplicate rows (within this file or the saved library).')}
            </p>
            <label>
              {t('Duplicate handling')}
              <select
                aria-label={t('Duplicate handling')}
                value={policy}
                onChange={(event) =>
                  setPolicy(event.target.value as DuplicatePolicy)
                }
              >
                <option value="skip">{t('Skip duplicates')}</option>
                <option value="replace">{t('Replace duplicates')}</option>
                <option value="keep">
                  {t('Keep duplicates as separate entries')}
                </option>
              </select>
            </label>
            <p>
              {t(
                'Duplicates match word, part of speech, English meaning and Vietnamese meaning after Unicode NFC normalization, trimming and lowercasing. Skip keeps the first entry. Replace updates all matching entries, preserves their IDs and creation dates, and uses the last valid file row. Empty optional fields in replacement rows clear saved values. Keep creates a separate entry for every valid row.',
              )}
            </p>
            <p>
              {t('Planned changes:')}{' '}
              {plan.writes.filter((write) => !write.original).length}{' '}
              {t('additions,')}{' '}
              {plan.writes.filter((write) => write.original).length}{' '}
              {t('existing entries replaced,')} {plan.skipped}{' '}
              {t('duplicate rows skipped.')}
            </p>
            {invalidCount > 0 && (
              <label className="invalid-consent">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(event) => setSkipInvalid(event.target.checked)}
                />{' '}
                {t('Import valid rows only and skip')} {invalidCount}{' '}
                {t('invalid rows')}
              </label>
            )}
            <div
              className="table-scroll"
              role="region"
              aria-label={t('Import preview')}
              tabIndex={0}
            >
              <table>
                <caption>
                  {t('Import preview with original worksheet row numbers')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('Row')}</th>
                    {fieldNames.map((key) => (
                      <th scope="col" key={key}>
                        {t(fields[key].label)}
                      </th>
                    ))}
                    <th scope="col">{t('Validation')}</th>
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
                            ? t('Invalid: {{value0}}', {
                                value0: row.errors
                                  .map((issue) => t(issue))
                                  .join(' '),
                              })
                            : row.duplicate
                              ? t('Duplicate: {{value0}}', {
                                  value0: t(
                                    policy === 'skip'
                                      ? 'Skip duplicates'
                                      : policy === 'replace'
                                        ? 'Replace duplicates'
                                        : 'Keep duplicates as separate entries',
                                  ),
                                })
                              : t('Valid: new entry')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!annotated.length && (
              <p>{t('No nonblank data rows were found.')}</p>
            )}
            <div className="toolbar">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                {t('Previous rows')}
              </button>
              <span>
                {t('Page')} {page + 1} {t('of')} {pages}
              </span>
              <button
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t('Next rows')}
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
                {t('Change mapping')}
              </button>
              <button onClick={() => void makePreview()}>
                {t('Refresh preview')}
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
                {t('Confirm import')}
              </button>
            </div>
            <p>
              {t(
                'No entries change until Confirm import succeeds. All planned changes are committed in one transaction. If the library changes, refresh this preview first.',
              )}
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      <p role="status">{busy ? t('Processing Excel file…') : t(status)}</p>
    </section>
  )
}
function columnLabel(index: number) {
  return index < 26
    ? String.fromCharCode(65 + index)
    : String.fromCharCode(64 + Math.floor(index / 26)) +
        String.fromCharCode(65 + (index % 26))
}
