import { lazy, Suspense, useEffect, useState } from 'react'
import {
  emptyInput,
  fieldNames,
  fields,
  queryVocabulary,
  ValidationError,
  type Field,
  type Vocabulary,
  type VocabularyInput,
} from './model'
import type { VocabularyRepository } from './repository'
import './vocabulary.css'
import { PartOfSpeechBadge, PartOfSpeechPicker } from './PartOfSpeechPicker'
type Draft = { original: Vocabulary | null; input: VocabularyInput }
const SpreadsheetPanel = lazy(() => import('../spreadsheet/SpreadsheetPanel'))
export function VocabularyManager({
  repository,
}: {
  repository: VocabularyRepository
}) {
  const [rows, setRows] = useState<Vocabulary[]>([])
  const [excelOpen, setExcelOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activeField, setActiveField] = useState<Field>('word')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [search, setSearch] = useState('')
  const [part, setPart] = useState('')
  const [sort, setSort] = useState<keyof Vocabulary>('word')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const dirty =
    draft !== null &&
    fieldNames.some((key) => draft.input[key] !== (draft.original?.[key] ?? ''))
  useEffect(() => {
    let active = true
    repository
      .list()
      .then((data) => {
        if (active) setRows(data)
      })
      .catch((reason: unknown) => {
        if (active) setError(message(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [repository])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  async function reload() {
    setLoading(true)
    try {
      setRows(await repository.list())
      setError('')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setLoading(false)
    }
  }
  function start(original: Vocabulary | null, field: Field = 'word') {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    setActiveField(field)
    setDraft({
      original,
      input: original ? { ...original } : { ...emptyInput },
    })
    setErrors({})
    setError('')
    setStatus('')
  }
  function cancel() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    setDraft(null)
    setErrors({})
    setError('')
  }
  async function save() {
    if (!draft || busy) return
    setBusy(true)
    setError('')
    setErrors({})
    setStatus('')
    try {
      const saved = draft.original
        ? await repository.update(
            draft.original.id,
            draft.input,
            draft.original.updated_at,
          )
        : await repository.create(draft.input)
      setRows((previous) => [
        ...previous.filter((row) => row.id !== saved.id),
        saved,
      ])
      setDraft(null)
      setStatus('Saved to this browser.')
    } catch (reason) {
      if (reason instanceof ValidationError) setErrors(reason.errors)
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }
  async function remove(row: Vocabulary) {
    if (
      !window.confirm(
        `Delete "${row.word}" and its meanings? This cannot be undone.`,
      )
    )
      return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await repository.delete(row.id, row.updated_at)
      setRows((previous) => previous.filter((entry) => entry.id !== row.id))
      setStatus('Entry deleted.')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }
  function cells(input: VocabularyInput) {
    return fieldNames.map((key) => (
      <td key={key}>
        {key === 'part_of_speech' ? (
          <PartOfSpeechPicker
            value={input[key]}
            disabled={busy}
            autoFocus={key === activeField}
            title={
              draft?.original
                ? `Added: ${formatDate(draft.original.created_at)}`
                : undefined
            }
            error={errors[key]}
            onSave={() => void save()}
            onChange={(value) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      input: { ...previous.input, part_of_speech: value },
                    }
                  : null,
              )
            }
          />
        ) : (
          <textarea
            aria-label={fields[key].label}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `error-${key}` : undefined}
            value={input[key]}
            title={
              draft?.original
                ? `Added: ${formatDate(draft.original.created_at)}`
                : undefined
            }
            disabled={busy}
            rows={3}
            maxLength={fields[key].limit}
            aria-keyshortcuts="Shift+Enter"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void save()
              }
            }}
            autoFocus={key === activeField}
            onChange={(event) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      input: { ...previous.input, [key]: event.target.value },
                    }
                  : null,
              )
            }
          />
        )}
        {errors[key] && (
          <span className="field-error" id={`error-${key}`}>
            {errors[key]}
          </span>
        )}
      </td>
    ))
  }
  const visible = queryVocabulary(rows, search, part, sort, direction)
  const displayed =
    draft?.original && !visible.some((row) => row.id === draft.original?.id)
      ? [draft.original, ...visible]
      : visible
  const actions = (
    <td className="actions">
      <button disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving...' : 'Save'}
      </button>
      <button disabled={busy} onClick={cancel}>
        Cancel
      </button>
    </td>
  )
  return (
    <main className="vocabulary-manager">
      <header>
        <p className="eyebrow">ENGLISH LEARNING HUB / GUEST LIBRARY</p>
        <h1>My vocabulary</h1>
        <p>
          Build your vocabulary, one meaning at a time. Entries stay in this
          browser and work offline once the app is loaded.
        </p>
        <p className="storage-note">
          Clearing browser data removes this library. Word and at least one
          meaning are required. Save each row to commit your changes.
        </p>
      </header>
      {excelOpen ? (
        <Suspense fallback={<p role="status">Loading Excel tools…</p>}>
          <SpreadsheetPanel
            repository={repository}
            onClose={() => setExcelOpen(false)}
            onImported={(entries) => {
              setRows(entries)
              setExcelOpen(false)
              setError('')
              setStatus('Import committed to this browser.')
            }}
          />
        </Suspense>
      ) : (
        <button
          disabled={loading || busy || draft !== null}
          onClick={() => setExcelOpen(true)}
        >
          Excel import / export
        </button>
      )}
      <fieldset disabled={excelOpen}>
        <div className="toolbar">
          <label>
            Search
            <input
              type="search"
              value={search}
              placeholder="Search any vocabulary field"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Part of speech
            <select
              aria-label="Filter by part of speech"
              value={part}
              onChange={(event) => setPart(event.target.value)}
            >
              <option value="">All parts of speech</option>
              {[
                ...new Set(
                  rows.map((row) => row.part_of_speech).filter(Boolean),
                ),
              ]
                .sort()
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as keyof Vocabulary)
              }
            >
              {[...fieldNames, 'created_at', 'updated_at'].map((key) => (
                <option key={key} value={key}>
                  {key in fields
                    ? fields[key as Field].label
                    : key === 'created_at'
                      ? 'Created'
                      : 'Updated'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as 'asc' | 'desc')
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <button disabled={loading || busy} onClick={() => start(null)}>
            Add vocabulary
          </button>
          <button
            disabled={loading || busy || draft !== null}
            onClick={() => void reload()}
          >
            Reload entries
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p role="status">
          {loading
            ? 'Loading vocabulary...'
            : status || `${visible.length} of ${rows.length} entries`}
        </p>
        {draft && (
          <p className="draft-note">
            {dirty ? 'Unsaved changes. ' : ''}Tab between cells, then Save or
            press Shift + Enter. Cancel asks before discarding changes.
          </p>
        )}
        <div
          className="table-scroll"
          role="region"
          aria-label="Vocabulary table"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              Guest vocabulary. Double-click a vocabulary cell or press Enter on
              it to edit, then Save or Cancel.
            </caption>
            <thead>
              <tr>
                {fieldNames.map((key) => (
                  <th key={key} scope="col">
                    {fields[key].label}
                  </th>
                ))}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {draft && !draft.original && (
                <tr>
                  {cells(draft.input)}
                  {actions}
                </tr>
              )}
              {displayed.map((row) => (
                <tr key={row.id}>
                  {draft?.original?.id === row.id ? (
                    <>
                      {cells(draft.input)}
                      {actions}
                    </>
                  ) : (
                    <>
                      {fieldNames.map((key) => (
                        <td key={key} className="editable-cell">
                          <button
                            className="cell-value"
                            title={`Added: ${formatDate(row.created_at)}`}
                            disabled={busy}
                            aria-label={`${fields[key].label} for ${row.word}`}
                            onDoubleClick={() => start(row, key)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                start(row, key)
                              }
                            }}
                          >
                            {key === 'part_of_speech' && row[key] ? (
                              <PartOfSpeechBadge value={row[key]} />
                            ) : (
                              row[key] || '-'
                            )}
                          </button>
                        </td>
                      ))}
                      <td className="actions">
                        <button
                          disabled={busy || draft !== null}
                          aria-label={`Delete ${row.word}`}
                          onClick={() => void remove(row)}
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !displayed.length && !draft && (
          <p className="empty">
            {rows.length
              ? 'No entries match your search or filter.'
              : 'Your library is empty. Add your first word to get started.'}
          </p>
        )}
      </fieldset>
    </main>
  )
}
function message(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'Something went wrong. Keep your draft and retry.'
}
function formatDate(value: string) {
  return new Date(value).toLocaleString()
}
