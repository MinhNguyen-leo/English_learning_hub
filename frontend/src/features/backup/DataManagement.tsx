import { useUiText } from '../../lib/useUiText'
import i18n from '../../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import {
  conflicts,
  counts,
  readBackupFile,
  type BackupData,
  type RestoreMode,
} from './model'
import type { BackupRepository, RestorePreview } from './repository'
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

  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [storage, setStorage] = useState<ReturnType<typeof counts> | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!active) return
    let mounted = true
    repository
      .export()
      .then((backup) => {
        if (mounted) setStorage(counts(backup.data))
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
      setStatus(
        'Full backup download started. Keep the JSON file somewhere safe.',
      )
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
      // Commit is complete; refresh all cached screens before allowing more edits.
      setConfirming(false)
      setPreview(null)
      try {
        await onRestored()
        setStorage(counts((await repository.export()).data))
      } catch (reason) {
        throw new Error(
          'Restore was committed, but the screens could not be refreshed. Reload the page before editing.',
          { cause: reason },
        )
      }
      if (input.current) input.current.value = ''
      if (navigator.storage?.estimate)
        void navigator.storage
          .estimate()
          .then(setEstimate)
          .catch(() => {})
      setStatus(
        'Full backup restored. Vocabulary, study progress and settings have been reloaded.',
      )
    })
  }
  const incoming = preview ? counts(preview.backup.data) : null
  const collisions = preview
    ? conflicts(preview.backup.data, preview.current)
    : null
  return (
    <main className="data-management" aria-busy={busy}>
      <header>
        <p className="eyebrow">{t('LOCAL DATA')}</p>
        <h1>{t('Data Management')}</h1>
        <p>
          {t(
            'Back up your vocabulary, saved flashcards, quiz answers and study preferences in one JSON file.',
          )}
        </p>
      </header>
      <p className="backup-warning">
        <strong>{t('Browser data can be lost.')}</strong>{' '}
        {t(
          'Clearing site data, private browsing, browser removal or storage eviction can erase your library. Download backups regularly. Files stay on your device.',
        )}
      </p>
      <section aria-labelledby="storage-title">
        <h2 id="storage-title">{t('Storage information')}</h2>
        {storage ? (
          <dl>
            {(Object.keys(labels) as (keyof BackupData)[]).map((key) => (
              <div key={key}>
                <dt>{t(labels[key])}</dt>
                <dd>{storage[key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>{t('Local record counts unavailable or loading.')}</p>
        )}
        <p>
          {estimate?.usage !== undefined
            ? t(
                'Estimated origin usage: {{value0}} MiB{{value1}}. This includes retained legacy progress copies.',
                {
                  value0: (estimate.usage / 1024 / 1024).toFixed(2),
                  value1:
                    estimate.quota !== undefined
                      ? t(' of {{value0}} MiB quota', {
                          value0: (estimate.quota / 1024 / 1024).toFixed(0),
                        })
                      : '',
                },
              )
            : t('Storage size estimates are not available in this browser.')}
        </p>
        <p>
          {t(
            'The app currently retains one active flashcard session and one active quiz, including completed quiz answers. There is no separate historical quiz archive.',
          )}
        </p>
      </section>
      <section aria-labelledby="export-title">
        <h2 id="export-title">{t('Export Full Backup')}</h2>
        <p>
          {t(
            'Includes IDs, timestamps, saved questions, answers, review marks and application settings. Unsaved edits are not included.',
          )}
        </p>
        <button disabled={busy} onClick={exportBackup}>
          {t('Export Full Backup')}
        </button>
      </section>
      <section aria-labelledby="restore-title">
        <h2 id="restore-title">{t('Restore Full Backup')}</h2>
        <label htmlFor="backup-file">
          {t('Choose a JSON backup (up to 32 MiB)')}
        </label>
        <input
          ref={input}
          id="backup-file"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.value = ''
          }}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        {preview && incoming && collisions && (
          <div className="restore-preview">
            <h3>{t('Restore preview')}</h3>
            <p>
              {t('Format version')} {preview.backup.formatVersion}{' '}
              {t('· Exported')}{' '}
              {new Date(preview.backup.exportedAt).toLocaleString(
                i18n.resolvedLanguage,
              )}
            </p>
            <ul>
              {(Object.keys(labels) as (keyof BackupData)[]).map((key) => (
                <li key={key}>
                  {t(labels[key])}: {incoming[key]} {t('incoming,')}{' '}
                  {counts(preview.current)[key]} {t('local,')} {collisions[key]}{' '}
                  {t('conflicting IDs')}
                </li>
              ))}
            </ul>
            <fieldset disabled={busy}>
              <legend>{t('Restore mode')}</legend>
              <label>
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />{' '}
                {t(
                  'Merge — keep existing records for matching IDs; add missing IDs.',
                )}
              </label>
              <label>
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />{' '}
                {t(
                  'Replace — replace all current vocabulary, progress and settings with this backup.',
                )}
              </label>
            </fieldset>
            <p>
              {t(
                'Merge preserves distinct IDs even when words have identical meanings. Saved study sessions retain their own word snapshots; deleted library words in a session are valid.',
              )}
            </p>
            <p>
              {t(
                'Restoring reloads learning screens and discards unsaved edits. Save any drafts before continuing. Other tabs must reload after a restore.',
              )}
            </p>
            <button
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
        )}
      </section>
      {busy && <p role="status">{t('Working with local storage…')}</p>}
      {status && <p role="status">{t(status)}</p>}
      {error && <p role="alert">{t(error)}</p>}
      <dialog
        ref={dialog}
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
          <button disabled={busy} onClick={() => setConfirming(false)}>
            {t('Cancel')}
          </button>
          <button disabled={busy} onClick={restore}>
            {t('Replace all local data')}
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
