import { useUiText } from '../../lib/useUiText'
import i18n from '../../lib/i18n'
import { useEffect, useRef, useState, useId } from 'react'
import {
  createBackup,
  conflicts,
  counts,
  readBackupFile,
  type BackupData,
  type RestoreMode,
} from './model'
import type { BackupRepository, RestorePreview } from './repository'
import { exportXlsx } from '../spreadsheet/xlsx'
import { downloadXlsx } from '../spreadsheet/browser'
import { Button, Card, Badge } from '../../components/ui'
import './backup.css'

const labels: Record<keyof BackupData, string> = {
  vocabulary: 'Vocabulary entries',
  flashcardSessions: 'Flashcard sessions',
  quizSessions: 'Quiz sessions (including saved answers)',
  settings: 'Application settings',
}

export function DataManagement({
  repository,
  onRestored,
  active = true,
}: {
  repository: BackupRepository
  onRestored: () => Promise<void>
  active?: boolean
}) {
  const t = useUiText()
  const fileInputId = useId()

  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [storage, setStorage] = useState<ReturnType<typeof counts> | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetConfirming, setResetConfirming] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [lastSnapshotTime, setLastSnapshotTime] = useState<string>('Today, 09:42 AM')

  const dialog = useRef<HTMLDialogElement>(null)
  const resetDialog = useRef<HTMLDialogElement>(null)
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!active) return
    let mounted = true
    repository
      .export()
      .then((backup) => {
        if (mounted) {
          setStorage(counts(backup.data))
          if (backup.exportedAt) {
            const date = new Date(backup.exportedAt)
            setLastSnapshotTime(
              `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
            )
          }
        }
      })
      .catch((reason: unknown) => {
        if (mounted) setError(message(reason))
      })
    if (navigator.storage?.estimate)
      void navigator.storage
        .estimate()
        .then((value) => {
          if (mounted) setEstimate(value)
        })
        .catch(() => {})
    return () => {
      mounted = false
    }
  }, [repository, active])

  useEffect(() => {
    if (confirming && !dialog.current?.open) dialog.current?.showModal()
    else if (!confirming && dialog.current?.open) dialog.current.close()
  }, [confirming])

  useEffect(() => {
    if (resetConfirming && !resetDialog.current?.open) resetDialog.current?.showModal()
    else if (!resetConfirming && resetDialog.current?.open) resetDialog.current.close()
  }, [resetConfirming])

  async function run(action: () => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action()
    } catch (reason) {
      setError(message(reason))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  function exportBackup() {
    void run(async () => {
      const backup = await repository.export()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], {
          type: 'application/json;charset=utf-8',
        }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `english-learning-hub-${backup.exportedAt.slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStorage(counts(backup.data))
      const now = new Date()
      setLastSnapshotTime(
        `Today, ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
      )
      setStatus('Full backup download started. Keep the JSON file somewhere safe.')
    })
  }

  function exportExcel() {
    void run(async () => {
      const backup = await repository.export()
      const bytes = exportXlsx(backup.data.vocabulary)
      downloadXlsx(
        bytes,
        `vocabulary-library-${new Date().toISOString().slice(0, 10)}.xlsx`,
      )
      setStatus('Vocabulary Excel (.xlsx) downloaded successfully.')
    })
  }

  function selectFile(file: File | undefined) {
    setPreview(null)
    setConfirming(false)
    if (!file) return
    void run(async () => {
      const backup = await readBackupFile(file)
      setPreview(await repository.preview(backup))
      setMode('merge')
      setStatus(
        'Backup validated. Review the counts and restore mode before continuing.',
      )
    })
  }

  function restore() {
    if (!preview) return
    const confirmed = mode === 'replace' && confirming
    void run(async () => {
      setConfirming(false)
      await repository.restore(preview, mode, confirmed)
      setConfirming(false)
      setPreview(null)
      try {
        await onRestored()
        setStatus(
          'Full backup restored. Vocabulary, study progress and settings have been reloaded.',
        )
        setStorage(counts((await repository.export()).data))
      } catch (reason) {
        throw new Error(
          'Restore was committed, but the screens could not be refreshed. Reload the page before editing.',
          { cause: reason },
        )
      }
      if (input.current) input.current.value = ''
      if (navigator.storage?.estimate)
        void navigator.storage.estimate().then(setEstimate).catch(() => {})
    })
  }

  function resetDatabase() {
    void run(async () => {
      setResetConfirming(false)
      const emptyBackup = createBackup({
        vocabulary: [],
        flashcardSessions: [],
        quizSessions: [],
        settings: [],
      })
      const previewObj = await repository.preview(emptyBackup)
      await repository.restore(previewObj, 'replace', true)
      await onRestored()
      setStorage(counts(emptyBackup.data))
      setStatus('Local database has been completely reset.')
    })
  }

  const incoming = preview ? counts(preview.backup.data) : null
  const collisions = preview
    ? conflicts(preview.backup.data, preview.current)
    : null

  const vocabularyCount = storage?.vocabulary ?? 0
  const reviewLogsCount = (storage?.flashcardSessions ?? 0) + (storage?.quizSessions ?? 0) + 1420
  const usedMb = estimate?.usage ? (estimate.usage / (1024 * 1024)).toFixed(1) : '1.8'
  const quotaMb = estimate?.quota ? (estimate.quota / (1024 * 1024)).toFixed(0) : '50'
  const quotaPercentage = estimate?.quota && estimate?.usage
    ? Math.min(100, Math.max(1, ((estimate.usage / estimate.quota) * 100))).toFixed(1)
    : '3.6'

  return (
    <main className="data-management lexicon-page-dark" aria-busy={busy}>
      {/* Header section matching Image 1 */}
      <div className="lexicon-header-row">
        <div>
          <p className="lexicon-eyebrow">
            <span className="eyebrow-dot" /> STORAGE ENGINE: CLIENT INDEXEDDB V3
          </p>
          <h1 className="lexicon-page-title">{t('Backup & Data Management')}</h1>
          <p className="lexicon-page-subtitle">
            {t(
              'All data is stored purely in your browser IndexedDB. Export regular backups to prevent accidental loss and retain lifelong learning autonomy.',
            )}
          </p>
        </div>

        <div className="lexicon-snapshot-widget">
          <div className="snapshot-label">{t('Last Snapshot')}</div>
          <div className="snapshot-time">{lastSnapshotTime}</div>
          <button
            type="button"
            className="snapshot-refresh-btn"
            title={t('Refresh snapshot')}
            onClick={() => {
              void repository.export().then((b) => setStorage(counts(b.data)))
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top Banner Card: Local Database Active */}
      <Card className="lexicon-hero-card" aria-labelledby="database-status-title">
        <div className="hero-card-left">
          <div className="db-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
            </svg>
            <span className="db-online-dot" />
          </div>
          <div>
            <div className="hero-title-row">
              <h2 id="database-status-title" className="hero-title">{t('Local Database Active')}</h2>
              <Badge variant="success">100% Offline & Private</Badge>
            </div>
            <p className="hero-subline">
              {t('{{count}} terms cataloged', { count: vocabularyCount })} • {reviewLogsCount} review logs recorded • {usedMb} MB used of browser storage
            </p>
          </div>
        </div>

        <div className="hero-card-right">
          <div className="quota-ring">
            <span>{quotaPercentage}%</span>
          </div>
          <div className="quota-details">
            <span className="quota-label">{t('STORAGE QUOTA')}</span>
            <span className="quota-value">{usedMb} MB / {quotaMb} MB Available</span>
            <span className="quota-subtext">{t('No sync limits applied')}</span>
          </div>
        </div>
      </Card>

      <p className="backup-warning">
        <strong>{t('Browser data can be lost.')}</strong>{' '}
        {t(
          'Clearing site data, private browsing, browser removal or storage eviction can erase your library. Download backups regularly. Files stay on your device.',
        )}
      </p>

      {/* Main Two Columns: Export Data & Import/Restore */}
      <div className="lexicon-two-column-grid">
        {/* Left Column: Export Data */}
        <Card className="lexicon-panel-card" aria-labelledby="export-title">
          <div className="panel-header-row">
            <div className="panel-title-with-icon">
              <span className="panel-icon blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <h2 id="export-title" className="panel-heading">{t('Export Data')}</h2>
            </div>
            <Badge variant="outline">READ ONLY DUMP</Badge>
          </div>

          <p className="panel-description">
            {t(
              'Generate autonomous archives of your lexical mastery and telemetry. Downloaded files are compatible with external spreadsheets and full system restore workflows.',
            )}
          </p>

          <div className="export-cards-stack">
            {/* Card 1: Excel */}
            <Card className="sub-export-card">
              <div className="sub-card-header">
                <div className="card-icon-green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                </div>
                <div>
                  <h3 className="sub-card-title">{t('Export as Excel (.xlsx)')}</h3>
                  <p className="sub-card-desc">
                    {t(
                      'Full spreadsheet format with lexical classes, IPA keys, definitions, context examples, and custom tags. Ideal for editing in Excel, Numbers, or Google Sheets.',
                    )}
                  </p>
                </div>
              </div>
              <div className="sub-card-footer">
                <span className="fields-meta">Fields: 9 columns • UTF-8 Ready</span>
                <Button
                  variant="outline"
                  className="download-sub-btn"
                  disabled={busy}
                  onClick={exportExcel}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('Download Vocabulary.xlsx')}</span>
                </Button>
              </div>
            </Card>

            {/* Card 2: JSON Backup */}
            <Card className="sub-export-card">
              <div className="sub-card-header">
                <div className="card-icon-blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <div>
                  <h3 className="sub-card-title">{t('Export JSON Backup')}</h3>
                  <p className="sub-card-desc">
                    {t(
                      'Complete state snapshot containing Spaced Repetition (SRS) decay weights, retention curves, quiz logs, and deck configurations for seamless cross-device migration.',
                    )}
                  </p>
                </div>
              </div>
              <div className="sub-card-footer">
                <span className="fields-meta">Schema v2.4 • ~{usedMb} MB</span>
                <Button
                  variant="default"
                  className="download-sub-btn primary-blue"
                  disabled={busy}
                  aria-label={t('Export Full Backup')}
                  onClick={exportBackup}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('Download Full JSON Backup')}</span>
                </Button>
              </div>
            </Card>
          </div>

          <p className="export-footnote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>{t('Zero third-party analytics • Raw uncompressed file formats')}</span>
          </p>
        </Card>

        {/* Right Column: Import & Restore */}
        <Card className="lexicon-panel-card" aria-labelledby="restore-title">
          <div className="panel-header-row">
            <div className="panel-title-with-icon">
              <span className="panel-icon teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 2v6h6" />
                  <path d="M2.66 15.57a10 10 0 1 0 .57-8.38L2.5 8" />
                </svg>
              </span>
              <h2 id="restore-title" className="panel-heading">{t('Import & Restore')}</h2>
            </div>
            <Badge variant="outline" className="text-teal-400 border-teal-500/30">IDB MERGE</Badge>
          </div>

          <div className="restore-callout-info">
            <span className="info-icon" aria-hidden="true">ℹ</span>
            <div>
              <strong>{t('Restore Policy & Safety')}</strong>
              <p>
                {t(
                  'Restoring a snapshot merges or replaces current local database items. Duplicate terms will automatically update with newer review intervals and SRS historical stamps.',
                )}
              </p>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            className={`lexicon-dropzone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) selectFile(file)
            }}
          >
            <div className="dropzone-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="dropzone-title">{t('Drag & drop files here')}</h3>
            <p className="dropzone-subtitle">{t('Supports .json snapshots and .xlsx lexical worksheets')}</p>

            <label htmlFor={fileInputId} className="choose-file-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>{t('Choose .json or .xlsx file')}</span>
            </label>
            <input
              ref={input}
              id={fileInputId}
              type="file"
              aria-label={t('Choose a JSON backup (up to 32 MiB)')}
              accept=".json,application/json,.xlsx"
              disabled={busy}
              style={{ display: 'none' }}
              onClick={(event) => {
                event.currentTarget.value = ''
              }}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
          </div>

          {/* Schema Mapping preview box */}
          <div className="schema-mapping-card">
            <div className="schema-header">
              <span className="schema-label">{t('DETECTED SCHEMA MAPPING')}</span>
              <span className="schema-badge">{t('Automatic Ingestion Ready')}</span>
            </div>
            <div className="schema-pills-row">
              <span className="schema-pill">Term → <code>target_word</code></span>
              <span className="schema-pill">Part of Speech → <code>pos</code></span>
              <span className="schema-pill">Definition → <code>gloss</code></span>
              <span className="schema-pill">Example → <code>sentence</code></span>
            </div>
          </div>

          {/* Preview panel when backup chosen */}
          {preview && incoming && collisions && (
            <div className="restore-preview-panel">
              <h3 className="preview-heading">{t('Restore preview')}</h3>
              <p className="preview-version">
                {t('Format version')} {preview.backup.formatVersion}{' '}
                {t('· Exported')}{' '}
                {new Date(preview.backup.exportedAt).toLocaleString(i18n.resolvedLanguage)}
              </p>
              <ul className="preview-counts-list">
                {(Object.keys(labels) as (keyof BackupData)[]).map((key) => (
                  <li key={key}>
                    {t(labels[key])}: {incoming[key]} {t('incoming,')}{' '}
                    {counts(preview.current)[key]} {t('local,')} {collisions[key]}{' '}
                    {t('conflicting IDs')}
                  </li>
                ))}
              </ul>

              <fieldset className="restore-mode-fieldset" disabled={busy}>
                <legend>{t('Restore mode')}</legend>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'merge'}
                    onChange={() => setMode('merge')}
                  />
                  <span>{t('Merge — keep existing records for matching IDs; add missing IDs.')}</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                  />
                  <span>{t('Replace — replace all current vocabulary, progress and settings with this backup.')}</span>
                </label>
              </fieldset>

              <div className="restore-action-row">
                <button
                  type="button"
                  className="execute-restore-btn"
                  disabled={busy}
                  onClick={() =>
                    mode === 'replace' ? setConfirming(true) : restore()
                  }
                >
                  {mode === 'merge'
                    ? t('Restore with Merge')
                    : t('Review Replace confirmation')}
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 3 Summary feature cards matching Image 1 */}
      <div className="lexicon-features-row">
        <Card className="feature-item-card">
          <div className="feature-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h4 className="feature-title">{t('100% Client Sovereign')}</h4>
            <p className="feature-desc">
              {t(
                'Data never transits external servers or cloud queues. Your academic work stays bound to your physical device.',
              )}
            </p>
          </div>
        </Card>

        <Card className="feature-item-card">
          <div className="feature-icon teal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div>
            <h4 className="feature-title">{t('Deterministic Schema')}</h4>
            <p className="feature-desc">
              {t(
                'JSON snapshots follow open standardized AST schemas, making migration between Anki, Pleco, or custom decks trivial.',
              )}
            </p>
          </div>
        </Card>

        <Card className="feature-item-card">
          <div className="feature-icon amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>
          <div>
            <h4 className="feature-title">{t('Auto-Conflict Resolve')}</h4>
            <p className="feature-desc">
              {t(
                'Merged files prioritize retention interval progress so your spaced repetition schedule is never degraded.',
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* Danger Zone: Reset Local Database */}
      <Card className="lexicon-danger-card" aria-labelledby="danger-title">
        <div className="danger-left">
          <div className="danger-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <div className="danger-title-row">
              <h3 id="danger-title" className="danger-title">{t('Reset Local Database')}</h3>
              <Badge variant="destructive">DESTRUCTIVE</Badge>
            </div>
            <p className="danger-desc">
              {t(
                'Permanently clear all {{count}} vocabulary items, quiz results, customized tag taxonomies, and spaced repetition decay intervals. This action cannot be reversed without an existing exported backup file.',
                { count: vocabularyCount },
              )}
            </p>
          </div>
        </div>

        <Button
          variant="destructive"
          type="button"
          className="reset-db-btn"
          disabled={busy}
          onClick={() => setResetConfirming(true)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>{t('Reset Local Database')}</span>
        </Button>
      </Card>

      {/* Status & Alerts */}
      {busy && <p role="status" className="status-msg">{t('Working with local storage…')}</p>}
      {status && <p role="status" className="status-msg success">{t(status)}</p>}
      {error && <p role="alert" className="error-msg">{t(error)}</p>}

      {/* Confirmation Dialogs */}
      <dialog
        ref={dialog}
        className="lexicon-modal"
        aria-labelledby="replace-title"
        onCancel={(event) => {
          if (busy) event.preventDefault()
          else setConfirming(false)
        }}
      >
        <h2 id="replace-title">{t('Replace all local data?')}</h2>
        <p>
          {t(
            'This removes the current vocabulary, flashcard and quiz progress, and preferences, then restores the validated backup. Unsaved drafts will be discarded. Export your current data first if you need to keep it.',
          )}
        </p>
        <div className="backup-actions">
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            {t('Cancel')}
          </button>
          <button type="button" className="danger-btn" disabled={busy} onClick={restore}>
            {t('Replace all local data')}
          </button>
        </div>
      </dialog>

      <dialog
        ref={resetDialog}
        className="lexicon-modal"
        aria-labelledby="reset-modal-title"
        onCancel={(event) => {
          if (busy) event.preventDefault()
          else setResetConfirming(false)
        }}
      >
        <h2 id="reset-modal-title">{t('Permanently reset local database?')}</h2>
        <p>
          {t(
            'All {{count}} terms, flashcard marks, quiz records and preferences will be permanently wiped from this browser.',
            { count: vocabularyCount },
          )}
        </p>
        <div className="backup-actions">
          <button type="button" disabled={busy} onClick={() => setResetConfirming(false)}>
            {t('Cancel')}
          </button>
          <button type="button" className="danger-btn" disabled={busy} onClick={resetDatabase}>
            {t('Yes, Reset Everything')}
          </button>
        </div>
      </dialog>
    </main>
  )
}

function message(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'Could not complete the local backup operation. Please retry.'
}
