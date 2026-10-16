import { useEffect, useRef, useState } from 'react'
import type { VocabularyRepository } from '../vocabulary/repository'
import type { Vocabulary } from '../vocabulary/model'
import { PartOfSpeechBadge } from '../vocabulary/PartOfSpeechPicker'
import type {
  ReviewProgressRepository,
  SavedSession,
} from './progressRepository'
import {
  createSession,
  reviewCounts,
  transition,
  type SessionSize,
  type StudyAction,
} from './session'
import './flashcards.css'
import { normalizeStudyText } from '../../lib/study'

export function Flashcards({
  repository,
  progress,
  initialSize = 20,
  onSizeChange,
}: {
  initialSize?: SessionSize
  onSizeChange?: (size: SessionSize) => void
  repository: VocabularyRepository
  progress: ReviewProgressRepository
}) {
  const [library, setLibrary] = useState<Vocabulary[]>([])
  const [saved, setSaved] = useState<SavedSession | null>(null)
  const [size, setSize] = useState<SessionSize>(initialSize)
  const [reviewMode, setReviewMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [restartOpen, setRestartOpen] = useState(false)
  const restartDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = restartDialog.current
    if (!dialog) return
    if (restartOpen && !dialog.open) dialog.showModal()
    else if (!restartOpen && dialog.open) dialog.close()
  }, [restartOpen])
  const locked = useRef(false)
  const studyRoot = useRef<HTMLElement>(null)
  const cardRoot = useRef<HTMLElement>(null)
  const restoreCardFocus = useRef(false)
  useEffect(() => {
    if (restoreCardFocus.current) {
      cardRoot.current?.focus()
      restoreCardFocus.current = false
    }
  }, [saved])
  useEffect(() => {
    let active = true
    void Promise.allSettled([repository.list(), progress.load()]).then(
      ([words, stored]) => {
        if (!active) return
        if (words.status === 'fulfilled') setLibrary(words.value)
        else setLibraryError(message(words.reason))
        if (stored.status === 'fulfilled') {
          setSaved(stored.value)
          setReady(true)
          setStatus(stored.value ? 'Resumed your saved session.' : '')
        } else setError(message(stored.reason))
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [repository, progress])
  async function run(operation: () => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await operation()
    } catch (reason) {
      setError(message(reason))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  function start() {
    if (
      saved &&
      !window.confirm(
        'Start a new session? This replaces the saved selection and review progress.',
      )
    )
      return
    void run(async () => {
      const words = await repository.list()
      setLibrary(words)
      setLibraryError('')
      const next = await progress.save(
        createSession(
          words,
          size,
          Math.random,
          new Set(
            reviewMode
              ? saved?.session.cards
                  .filter((card) =>
                    saved.session.reviews.some(
                      (review) =>
                        review.id === card.id &&
                        review.status === 'not-remembered',
                    ),
                  )
                  .map((card) => normalizeStudyText(card.word))
              : [],
          ),
        ),
        saved?.revision ?? null,
      )
      setSaved(next)
      setStatus('New session saved locally.')
    })
  }
  function act(action: StudyAction) {
    if (!saved) return
    const shouldFocus = Boolean(
      cardRoot.current?.contains(document.activeElement),
    )
    void run(async () => {
      const next = await progress.save(
        transition(saved.session, action),
        saved.revision,
      )
      restoreCardFocus.current = shouldFocus
      setSaved(next)
      if (action.type === 'restart') setRestartOpen(false)
      setStatus('Progress saved locally.')
    })
  }
  function reload() {
    void run(async () => {
      const stored = await progress.load()
      setSaved(stored)
      setReady(true)
      setStatus('Saved progress reloaded.')
    })
  }
  function refreshLibrary() {
    void run(async () => {
      try {
        setLibrary(await repository.list())
        setLibraryError('')
        setStatus(
          'Available vocabulary refreshed. Your session selection is unchanged.',
        )
      } catch (reason) {
        setLibraryError(message(reason))
      }
    })
  }
  const session = saved?.session
  const card = session?.cards[session.index]
  const counts = session ? reviewCounts(session) : null
  const review = session?.reviews.find((item) => item.id === card?.id)?.status
  const availableCount = new Set(
    library.map((row) => normalizeStudyText(row.word)).filter(Boolean),
  ).size
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const root = studyRoot.current
      if (
        !root ||
        root.closest('[hidden]') ||
        !session ||
        restartOpen ||
        busy ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return
      const target = event.target
      if (target instanceof Element) {
        if (
          target.closest(
            'button, a, input, textarea, select, [role="button"], [contenteditable]:not([contenteditable="false"])',
          )
        )
          return
        if (target !== document.body && !root.contains(target)) return
      }
      if (event.key === ' ') {
        event.preventDefault()
        act({ type: 'flip' })
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (session.index < session.cards.length - 1) act({ type: 'next' })
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (session.index > 0) act({ type: 'previous' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })
  return (
    <main className="flashcards" ref={studyRoot}>
      <header>
        <p className="eyebrow">ENGLISH LEARNING HUB / FLASHCARDS</p>
        <h1>Study your vocabulary</h1>
        <p>
          Your selected cards stay fixed throughout the session, even if
          vocabulary is edited or deleted. Progress is saved in this browser
          after each action.
        </p>
      </header>
      {loading ? (
        <p role="status">Loading vocabulary and saved progress…</p>
      ) : (
        <>
          <div className="study-toolbar">
            <label>
              Study mode
              <select
                value={reviewMode ? 'review' : 'random'}
                disabled={busy}
                onChange={(event) =>
                  setReviewMode(event.target.value === 'review')
                }
              >
                <option value="random">Random study</option>
                <option value="review">Review mistakes first</option>
              </select>
            </label>
            <label>
              Session size
              <select
                value={size}
                disabled={busy}
                onChange={(event) => {
                  const next =
                    event.target.value === 'all'
                      ? 'all'
                      : (Number(event.target.value) as 20 | 50)
                  setSize(next)
                  onSizeChange?.(next)
                }}
              >
                <option value={20}>20 words</option>
                <option value={50}>50 words</option>
                <option value="all">All available words</option>
              </select>
            </label>
            <button
              disabled={
                busy || !ready || Boolean(libraryError) || !library.length
              }
              onClick={start}
            >
              {session ? 'Start new session' : 'Start session'}
            </button>
            <button disabled={busy} onClick={refreshLibrary}>
              Refresh available words
            </button>
            <button disabled={busy} onClick={reload}>
              Reload saved progress
            </button>
          </div>
          <p>
            {availableCount} distinct words available.{' '}
            {size !== 'all' && availableCount < size && availableCount > 0
              ? `Fewer than ${size} words are available; the new session will use all ${availableCount}.`
              : 'New sessions do not repeat a target word.'}
          </p>
          <p className="study-footnote">
            {reviewMode
              ? 'New sessions put Not remembered words from your saved flashcard session first, then random words. No due dates are stored; this is not overdue scheduling.'
              : 'Random study remains available. Multiple records for the same word contribute one card.'}
          </p>
          {!library.length && !libraryError && (
            <p>
              Add vocabulary in the Vocabulary tab to start a new session.
              {session ? ' Your saved session is still available below.' : ''}
            </p>
          )}
          {libraryError && (
            <p role="alert" className="error">
              Could not load available vocabulary: {libraryError} You can retry
              with Refresh available words.
            </p>
          )}
          {!ready && (
            <p>
              Saved progress has not been loaded. Use Reload saved progress to
              retry before starting a session.
            </p>
          )}
          {error && !restartOpen && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p role="status">{busy ? 'Saving / loading…' : status}</p>
          {session && card && counts && (
            <>
              <p className="study-position">
                Card {session.index + 1} of {session.cards.length}
              </p>
              <article
                ref={cardRoot}
                key={card.id}
                className={`study-card ${session.flipped ? 'is-flipped' : ''}`}
                aria-label={session.flipped ? 'Card back' : 'Card front'}
                aria-live="polite"
                tabIndex={0}
                aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
                onClick={(event) => {
                  if (
                    !(
                      event.target instanceof Element &&
                      event.target.closest('button')
                    ) &&
                    !busy
                  )
                    act({ type: 'flip' })
                }}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    event.key === 'Enter'
                  ) {
                    event.preventDefault()
                    if (!busy) act({ type: 'flip' })
                  }
                }}
              >
                <div className="study-card-rotor">
                  <div
                    className="study-face study-front"
                    aria-hidden={session.flipped}
                    inert={session.flipped}
                  >
                    <span className="card-kicker">VOCABULARY · FLASHCARDS</span>
                    <div className="card-center">
                      <h2>{card.word}</h2>
                    </div>
                    <button
                      className="card-flip"
                      disabled={busy}
                      aria-pressed={false}
                      onClick={() => act({ type: 'flip' })}
                    >
                      <span aria-hidden="true">⟳</span> Flip card
                    </button>
                  </div>
                  <div
                    className="study-face study-back"
                    aria-hidden={!session.flipped}
                    inert={!session.flipped}
                  >
                    <span className="card-kicker">NGHĨA VÀ VÍ DỤ</span>
                    <dl className="card-center">
                      <dt className="sr-only">Vietnamese meaning</dt>
                      <dd className="card-meaning">
                        <h2>
                          {card.vietnamese_meaning ||
                            card.english_meaning ||
                            'Not provided'}
                        </h2>
                      </dd>
                      <dt>English meaning</dt>
                      <dd>{card.english_meaning || 'Not provided'}</dd>
                      <dt>Part of speech</dt>
                      <dd>
                        {card.part_of_speech ? (
                          <PartOfSpeechBadge value={card.part_of_speech} />
                        ) : (
                          'Not provided'
                        )}
                      </dd>
                      <dt>Example</dt>
                      <dd className="card-example">
                        {card.example_sentence || 'Not provided'}
                      </dd>
                    </dl>
                    <button
                      className="card-flip"
                      disabled={busy}
                      aria-pressed={true}
                      onClick={() => act({ type: 'flip' })}
                    >
                      <span aria-hidden="true">⟳</span> Show word
                    </button>
                  </div>
                </div>
                <button
                  className="study-arrow study-previous"
                  aria-label="Previous"
                  aria-keyshortcuts="ArrowLeft"
                  disabled={busy || session.index === 0}
                  onClick={() => act({ type: 'previous' })}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <button
                  className="study-arrow study-next"
                  aria-label="Next"
                  aria-keyshortcuts="ArrowRight"
                  disabled={busy || session.index === session.cards.length - 1}
                  onClick={() => act({ type: 'next' })}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </article>
              <div className="study-review-controls">
                <button
                  className="study-not-remembered"
                  aria-label="Not remembered"
                  disabled={busy}
                  aria-pressed={review === 'not-remembered'}
                  onClick={() =>
                    act({ type: 'review', status: 'not-remembered' })
                  }
                >
                  <span aria-hidden="true">↻</span> Chưa thuộc
                </button>
                <button
                  className="study-remembered"
                  aria-label="Remembered"
                  disabled={busy}
                  aria-pressed={review === 'remembered'}
                  onClick={() => act({ type: 'review', status: 'remembered' })}
                >
                  <span aria-hidden="true">✓</span> Đã học
                </button>
              </div>
              <p className="study-keyboard-hint">
                Space: lật thẻ · ←: thẻ trước · →: thẻ tiếp theo
              </p>
              <p>
                Remembered: {counts.remembered} · Not remembered:{' '}
                {counts.notRemembered} · Unreviewed: {counts.unreviewed}
              </p>
              <progress
                aria-label="Review completion"
                value={session.reviews.length}
                max={session.cards.length}
              />
              {counts.unreviewed === 0 && (
                <p>
                  All cards reviewed. Revisit any card or restart these cards to
                  practise again.
                </p>
              )}
              <div className="study-toolbar">
                <button
                  disabled={busy}
                  onClick={() => act({ type: 'shuffle' })}
                >
                  Shuffle current cards
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setError('')
                    setRestartOpen(true)
                  }}
                >
                  Restart current cards
                </button>
              </div>
              <p>
                Shuffle keeps your selected cards and review marks. Restart
                keeps the same cards and clears review marks. Use Start new
                session for a fresh sample.
              </p>
            </>
          )}
          <p className="study-footnote">
            Progress is local to this browser profile. Clearing browser storage
            removes it.
          </p>
        </>
      )}
      <dialog
        ref={restartDialog}
        className="restart-dialog"
        aria-labelledby="restart-title"
        aria-describedby="restart-description"
        onCancel={(event) => {
          event.preventDefault()
          if (!busy) setRestartOpen(false)
        }}
      >
        <span className="restart-dialog-icon" aria-hidden="true">
          ↻
        </span>
        <h2 id="restart-title">Bắt đầu lại bộ thẻ?</h2>
        <p id="restart-description">
          Bạn sẽ quay về thẻ đầu tiên và xóa các đánh dấu Đã học / Chưa thuộc.
          Bộ từ đã chọn vẫn được giữ nguyên.
        </p>
        {error && restartOpen && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="restart-dialog-actions">
          <button
            autoFocus
            disabled={busy}
            onClick={() => setRestartOpen(false)}
          >
            Hủy
          </button>
          <button
            className="restart-confirm"
            disabled={busy}
            onClick={() => act({ type: 'restart' })}
          >
            {busy ? 'Đang lưu…' : 'Bắt đầu lại'}
          </button>
        </div>
      </dialog>
    </main>
  )
}
function message(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'An unexpected error occurred. Please retry.'
}
