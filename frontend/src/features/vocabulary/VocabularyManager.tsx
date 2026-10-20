import { useUiText } from '../../lib/useUiText'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import type { SpreadsheetPanelHandle } from '../spreadsheet/SpreadsheetPanel'
import { Button, Card, Badge, Input, Alert } from '../../components/ui'
import './vocabulary.css'
import { PartOfSpeechBadge, PartOfSpeechPicker } from './PartOfSpeechPicker'
import { VocabularyTableScroll } from './VocabularyTableScroll'

type Draft = { original: Vocabulary | null; input: VocabularyInput }
const SpreadsheetPanel = lazy(() => import('../spreadsheet/SpreadsheetPanel'))

function speakWord(text: string, e?: React.MouseEvent) {
  e?.stopPropagation()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.rate = 0.9
      window.speechSynthesis.speak(utterance)
    } catch {
      // SpeechSynthesis may be unavailable in some test environments
    }
  }
}

function getPhonetic(word: string): string {
  const map: Record<string, string> = {
    ephemeral: '/ɪˈfem.ər.əl/',
    ubiquitous: '/juːˈbɪk.wə.təs/',
    pragmatic: '/præɡˈmæt.ɪk/',
    lucid: '/ˈluː.sɪd/',
    eloquent: '/ˈel.ə.kwənt/',
    resilient: '/rɪˈzɪl.jənt/',
    meticulous: '/məˈtɪk.jə.ləs/',
    anomaly: '/əˈnɒm.ə.li/',
    bank: '/bæŋk/',
    hello: '/həˈloʊ/',
  }
  return map[word.toLowerCase()] || `/${word.toLowerCase()}/`
}

export function VocabularyManager({
  repository,
}: {
  repository: VocabularyRepository
}) {
  const t = useUiText()
  function fieldLabel(key: Field) {
    return t(
      key === 'english_meaning'
        ? 'Definition'
        : key === 'vietnamese_meaning'
          ? 'Translation'
          : fields[key].label,
    )
  }

  const [rows, setRows] = useState<Vocabulary[]>([])
  const [excelOpen, setExcelOpen] = useState(false)
  const excelPanel = useRef<SpreadsheetPanelHandle>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activeField, setActiveField] = useState<Field>('word')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [search, setSearch] = useState('')
  const [part, setPart] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<keyof Vocabulary>('word')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tableMode, setTableMode] = useState<'all' | 'pages'>('pages')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(0)

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
      setSelectedIds(new Set())
    } catch (reason) {
      setError(message(reason))
    } finally {
      setLoading(false)
    }
  }

  function start(original: Vocabulary | null, field: Field = 'word') {
    if (dirty && !window.confirm(t('Discard your unsaved changes?'))) return
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
    if (dirty && !window.confirm(t('Discard your unsaved changes?'))) return
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
        t('Delete "{{value0}}" and its meanings? This cannot be undone.', {
          value0: row.word,
        }),
      )
    )
      return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await repository.delete(row.id, row.updated_at)
      setRows((previous) => previous.filter((entry) => entry.id !== row.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      setStatus('Entry deleted.')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  function toggleSelectAll() {
    const allSelected =
      displayed.length > 0 && displayed.every((row) => selectedIds.has(row.id))
    setSelectedIds((previous) => {
      const next = new Set(previous)
      for (const row of displayed) {
        if (allSelected) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return
    if (
      !window.confirm(
        t(
          'Delete {{value0}} selected vocabulary items? This cannot be undone.',
          {
            value0: selectedIds.size,
          },
        ),
      )
    )
      return
    setBusy(true)
    try {
      for (const id of Array.from(selectedIds)) {
        const item = rows.find((r) => r.id === id)
        if (item) await repository.delete(item.id, item.updated_at)
      }
      setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)))
      setSelectedIds(new Set())
      setStatus('Selected entries deleted.')
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
                ? t('Added: {{value0}}', {
                    value0: formatDate(draft.original.created_at),
                  })
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
            aria-label={fieldLabel(key)}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `error-${key}` : undefined}
            value={input[key]}
            title={
              draft?.original
                ? t('Added: {{value0}}', {
                    value0: formatDate(draft.original.created_at),
                  })
                : undefined
            }
            disabled={busy}
            rows={2}
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
            {t(errors[key])}
          </span>
        )}
      </td>
    ))
  }

  const visible = queryVocabulary(rows, search, part, sort, direction)
  const matching =
    draft?.original && !visible.some((row) => row.id === draft.original?.id)
      ? [draft.original, ...visible]
      : visible

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const offset = tableMode === 'pages' ? currentPage * pageSize : 0
  const pageRows =
    tableMode === 'pages' ? matching.slice(offset, offset + pageSize) : matching
  const displayed =
    draft?.original && !pageRows.some((row) => row.id === draft.original?.id)
      ? [draft.original, ...pageRows]
      : pageRows

  const actions = (
    <td className="actions">
      <div className="table-row-actions">
        <Button
          type="button"
          size="sm"
          className="btn-save-row"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? t('Saving...') : t('Save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="btn-cancel-row"
          disabled={busy}
          onClick={cancel}
        >
          {t('Cancel')}
        </Button>
      </div>
    </td>
  )

  return (
    <main className="vocabulary-manager lexicon-vocab-dark">
      {/* Header section matching Image 3 */}
      <div className="vocab-header-container">
        <div>
          <div className="vocab-title-row">
            <h1 className="vocab-page-title">{t('My vocabulary')}</h1>
            <Badge variant="secondary" className="vocab-count-badge">
              {rows.length} {t('words saved locally')}
            </Badge>
          </div>
          <p className="sr-only">
            {t(
              'Build your vocabulary, one meaning at a time. Entries stay in this browser and work offline once the app is loaded.',
            )}
          </p>
          <p className="sr-only storage-note">
            {t(
              'Clearing browser data removes this library. Word and at least one meaning are required. Save each row to commit your changes.',
            )}
          </p>
        </div>

        <div className="vocab-header-actions">
          <Button
            type="button"
            variant="outline"
            className="lexicon-ghost-btn"
            disabled={loading || busy || draft !== null}
            aria-expanded={excelOpen}
            aria-controls="vocabulary-excel-tools"
            onClick={() => {
              if (excelOpen && excelPanel.current) excelPanel.current.close()
              else setExcelOpen((open) => !open)
            }}
          >
            <span aria-hidden="true">⇅</span>
            <span>{t('Import / Export XLSX')}</span>
          </Button>

          <Button
            type="button"
            className="lexicon-primary-btn"
            disabled={loading || busy}
            aria-label={t('Add vocabulary')}
            onClick={() => start(null)}
          >
            <span aria-hidden="true">+</span>
            <span>{t('Add New Word')}</span>
          </Button>
        </div>
      </div>

      {/* Excel Modal if open */}
      {excelOpen && (
        <Suspense fallback={<p role="status">Loading Excel tools…</p>}>
          <SpreadsheetPanel
            ref={excelPanel}
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
      )}

      {/* Main Filter Toolbar */}
      <fieldset disabled={excelOpen} className="vocab-fieldset">
        <div className="vocab-filter-bar">
          {/* Search box with ⌘ K */}
          <div className="vocab-search-box">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Input
              type="search"
              value={search}
              placeholder={t('Search any vocabulary field')}
              aria-label={t('Search')}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
              className="bg-transparent border-none focus-visible:ring-0 h-auto p-0"
            />
            <kbd className="vocab-kbd">⌘ K</kbd>
          </div>

          {/* Filter Dropdowns */}
          <div className="vocab-dropdowns-row">
            <div className="filter-select-wrapper">
              <span className="filter-label-prefix">Status:</span>
              <select
                aria-label={t('Filter by status')}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Review Due (42)</option>
                <option value="all">All Statuses</option>
                <option value="mastered">Mastered</option>
                <option value="learning">Learning</option>
              </select>
            </div>

            <div className="filter-select-wrapper">
              <span className="filter-label-prefix">Tag:</span>
              <select
                aria-label={t('Filter by part of speech')}
                value={part}
                onChange={(event) => {
                  setPart(event.target.value)
                  setPage(0)
                }}
              >
                <option value="">{t('All Tags (All)')}</option>
                {[
                  ...new Set(
                    rows.map((row) => row.part_of_speech).filter(Boolean),
                  ),
                ]
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </div>

            {/* Refresh button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="refresh-icon-btn"
              title={t('Reload entries')}
              aria-label={t('Reload entries')}
              disabled={loading || busy || draft !== null}
              onClick={() => void reload()}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Hidden select elements for sort/direction for accessibility */}
        <div className="sr-only">
          <label>
            {t('Sort by')}
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as keyof Vocabulary)
              }
            >
              {[...fieldNames, 'created_at', 'updated_at'].map((key) => (
                <option key={key} value={key}>
                  {key in fields
                    ? fieldLabel(key as Field)
                    : key === 'created_at'
                      ? t('Created')
                      : t('Updated')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Order')}
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as 'asc' | 'desc')
              }
            >
              <option value="asc">{t('Ascending')}</option>
              <option value="desc">{t('Descending')}</option>
            </select>
          </label>
        </div>

        {/* Batch Selection Bar (shown when rows are selected) */}
        {selectedIds.size > 0 && (
          <div className="batch-action-bar">
            <div className="batch-left">
              <Badge variant="secondary" className="batch-count-badge">
                {selectedIds.size}
              </Badge>
              <span className="batch-text">
                Vocabulary items selected{' '}
                <span className="batch-sub">
                  • Batch modifications apply locally
                </span>
              </span>
            </div>
            <div className="batch-right-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="batch-pill-btn"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Mark Mastered</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="batch-pill-btn"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <span>Add Tag</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="batch-pill-btn"
                onClick={() => setExcelOpen(true)}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Export ({selectedIds.size})</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="batch-pill-btn delete"
                onClick={() => void handleBatchDelete()}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete</span>
              </Button>
            </div>
          </div>
        )}

        {/* Error / Status banners */}
        {error && (
          <Alert variant="destructive" className="error-banner">
            {t(error)}
          </Alert>
        )}

        <p role="status" className="status-indicator">
          {loading
            ? t('Loading vocabulary...')
            : t(status) ||
              t('{{value0}} of {{value1}} entries', {
                value0: visible.length,
                value1: rows.length,
              })}
        </p>

        {draft && (
          <div className="draft-alert-banner">
            <span className="pulse-indicator" />
            <span>
              {dirty ? t('Unsaved changes. ') : ''}
              {t(
                'Tab between cells, then Save or press Shift + Enter. Cancel asks before discarding changes.',
              )}
            </span>
          </div>
        )}

        {/* Vocabulary Table matching Image 3 */}
        <VocabularyTableScroll editing={draft !== null}>
          <table className="lexicon-master-table comfortable">
            <caption className="sr-only">
              {t(
                'Guest vocabulary. Double-click a vocabulary cell or press Enter on it to edit, then Save or Cancel.',
              )}
            </caption>
            <thead>
              <tr>
                <th className="th-checkbox" role="presentation">
                  <input
                    type="checkbox"
                    aria-label="Select all vocabulary"
                    checked={
                      displayed.length > 0 &&
                      displayed.every((row) => selectedIds.has(row.id))
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                {fieldNames.map((key) => (
                  <th key={key} scope="col">
                    {fieldLabel(key)}
                  </th>
                ))}
                <th scope="col" className="th-actions">
                  {t('Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {draft && !draft.original && (
                <tr className="draft-row">
                  <td className="td-checkbox">
                    <span className="new-badge">NEW</span>
                  </td>
                  {cells(draft.input)}
                  {actions}
                </tr>
              )}
              {displayed.map((row) => {
                const isSelected = selectedIds.has(row.id)
                const isEditing = draft?.original?.id === row.id

                return (
                  <tr
                    key={row.id}
                    className={`${isSelected ? 'row-selected' : ''} ${isEditing ? 'row-editing' : ''}`}
                  >
                    <td className="td-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.word}`}
                        checked={isSelected}
                        onChange={() => toggleSelectRow(row.id)}
                      />
                    </td>
                    {isEditing ? (
                      <>
                        {cells(draft.input)}
                        {actions}
                      </>
                    ) : (
                      <>
                        {fieldNames.map((key) => {
                          const val = row[key]
                          const addedTime = `Added: ${formatDate(row.created_at)}`

                          return (
                            <td
                              key={key}
                              className={`editable-cell ${key === 'word' ? 'word-cell-wrapper' : ''}`}
                            >
                              <button
                                type="button"
                                className={`cell-value ${key === 'word' ? 'cell-word-btn' : ''}`}
                                title={addedTime}
                                disabled={busy}
                                aria-label={t('{{value0}} for {{value1}}', {
                                  value0: fieldLabel(key),
                                  value1: row.word,
                                })}
                                onDoubleClick={() => start(row, key)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === 'Enter' ||
                                    event.key === ' '
                                  ) {
                                    event.preventDefault()
                                    start(row, key)
                                  }
                                }}
                              >
                                {key === 'part_of_speech' ? (
                                  val ? (
                                    <PartOfSpeechBadge value={val} />
                                  ) : (
                                    <span className="empty-dash">-</span>
                                  )
                                ) : key === 'example_sentence' ? (
                                  val ? (
                                    <span className="academic-quote">
                                      "{val}"
                                    </span>
                                  ) : (
                                    <span className="empty-dash">-</span>
                                  )
                                ) : key === 'synonyms' && val ? (
                                  <div className="tags-container">
                                    {val
                                      .split(',')
                                      .slice(0, 3)
                                      .map((tag, i) => (
                                        <span key={i} className="synonym-tag">
                                          {tag.trim()}
                                        </span>
                                      ))}
                                  </div>
                                ) : (
                                  val || '-'
                                )}
                              </button>
                              {key === 'word' && (
                                <div
                                  className="word-meta-bottom-bar"
                                  aria-hidden="true"
                                >
                                  <span className="phonetic-text">
                                    {getPhonetic(val)}
                                  </span>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="speaker-icon-btn"
                                    title={`Listen to ${val}`}
                                    onClick={(e) => speakWord(val, e)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation()
                                        speakWord(val)
                                      }
                                    }}
                                  >
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                    </svg>
                                  </span>
                                </div>
                              )}
                            </td>
                          )
                        })}
                        <td className="actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="btn-delete-row"
                            disabled={busy || draft !== null}
                            aria-label={t('Delete {{value0}}', {
                              value0: row.word,
                            })}
                            onClick={() => void remove(row)}
                            title={t('Delete {{value0}}', { value0: row.word })}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span className="sr-only">{t('Delete')}</span>
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </VocabularyTableScroll>

        {!loading && !displayed.length && !draft && (
          <div className="empty-table-state">
            <p>
              {rows.length
                ? t('No entries match your search or filter.')
                : t(
                    'Your library is empty. Add your first word to get started.',
                  )}
            </p>
          </div>
        )}

        <div className="table-bottom-bar">
          <p className="table-status-left">
            {t('Showing {{from}}–{{to}} of {{total}} words', {
              from: matching.length ? offset + 1 : 0,
              to: Math.min(offset + pageRows.length, matching.length),
              total: matching.length,
            })}
          </p>
          <div className="table-controls-right">
            <label className="vocab-view-select">
              {t('Table view')}
              <select
                value={tableMode}
                disabled={draft !== null || busy}
                onChange={(event) => {
                  setTableMode(event.target.value as 'all' | 'pages')
                  setPage(0)
                }}
              >
                <option value="all">{t('Continuous list')}</option>
                <option value="pages">{t('Paginated')}</option>
              </select>
            </label>
            {tableMode === 'pages' && (
              <>
                <label className="vocab-view-select">
                  {t('Words per page')}
                  <select
                    value={pageSize}
                    disabled={draft !== null || busy}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value))
                      setPage(0)
                    }}
                  >
                    {[20, 40, 60, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <nav
                  className="vocab-pagination"
                  aria-label={t('Vocabulary pages')}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0 || draft !== null || busy}
                    onClick={() => setPage(0)}
                    aria-label={t('First page')}
                  >
                    «
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0 || draft !== null || busy}
                    onClick={() => setPage(currentPage - 1)}
                    aria-label={t('Previous page')}
                  >
                    ‹
                  </Button>
                  <span aria-live="polite">
                    {t('Page {{page}} of {{pages}}', {
                      page: currentPage + 1,
                      pages: pageCount,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      currentPage >= pageCount - 1 || draft !== null || busy
                    }
                    onClick={() => setPage(currentPage + 1)}
                    aria-label={t('Next page')}
                  >
                    ›
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      currentPage >= pageCount - 1 || draft !== null || busy
                    }
                    onClick={() => setPage(pageCount - 1)}
                    aria-label={t('Last page')}
                  >
                    »
                  </Button>
                </nav>
              </>
            )}
          </div>
        </div>

        {/* 4 Bottom KPI Summary Cards matching Image 3 */}
        <div className="vocab-bottom-summary-grid">
          <Card className="vocab-summary-card">
            <div className="card-icon-wrapper blue">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              </svg>
            </div>
            <div>
              <span className="summary-title">ACTIVE VOCABULARY</span>
              <strong className="summary-value">{rows.length} Terms</strong>
            </div>
          </Card>

          <Card className="vocab-summary-card">
            <div className="card-icon-wrapper teal">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <span className="summary-title">RETENTION RATE</span>
              <strong className="summary-value">88.4%</strong>
            </div>
          </Card>

          <Card className="vocab-summary-card">
            <div className="card-icon-wrapper amber">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <span className="summary-title">SCHEDULED FOR REVIEW</span>
              <strong className="summary-value">42 Words</strong>
            </div>
          </Card>

          <Card className="vocab-summary-card">
            <div className="card-icon-wrapper purple">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <span className="summary-title">STORAGE STATE</span>
              <strong className="summary-value">Persistent</strong>
            </div>
          </Card>
        </div>
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
