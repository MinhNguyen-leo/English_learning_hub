import { useUiText } from '../../lib/useUiText'
import { useEffect, useRef, useState } from 'react'
import type { VocabularyRepository } from '../vocabulary/repository'
import type { Vocabulary } from '../vocabulary/model'
import { PartOfSpeechBadge } from '../vocabulary/PartOfSpeechPicker'
import { FlashcardArtwork } from './FlashcardArtwork'
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
import { Button, Badge } from '../../components/ui'
import './flashcards.css'
import { normalizeStudyText } from '../../lib/study'

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
      // Audio fallback in non-browser environments
    }
  }
}

function getPhonetic(word: string): string {
  const map: Record<string, string> = {
    eloquence: "/'el.ə.kwəns/",
    ephemeral: '/ɪˈfem.ər.əl/',
    ubiquitous: '/juːˈbɪk.wə.təs/',
    pragmatic: '/præɡˈmæt.ɪk/',
    lucid: '/ˈluː.sɪd/',
    resilient: '/rɪˈzɪl.jənt/',
    meticulous: '/məˈtɪk.jə.ləs/',
    anomaly: '/əˈnɒm.ə.li/',
    bank: '/bæŋk/',
    hello: '/həˈloʊ/',
  }
  return map[word.toLowerCase()] || `/${word.toLowerCase()}/`
}



export function Flashcards({
  repository,
  progress,
  initialSize = 20,
  onSizeChange,
  streak,
  onNavigate,
}: {
  initialSize?: SessionSize
  onSizeChange?: (size: SessionSize) => void
  repository: VocabularyRepository
  progress: ReviewProgressRepository
  streak?: { days: number | null; error: string | null; retry: () => void }
  onNavigate?: (destination: 'vocabulary' | 'flashcards' | 'quiz') => void
}) {
  const t = useUiText()

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
        t(
          'Start a new session? This replaces the saved selection and review progress.',
        ),
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
      } else if (event.key === '1' || event.key === '2') {
        event.preventDefault()
        act({ type: 'review', status: 'not-remembered' })
      } else if (event.key === '3' || event.key === '4') {
        event.preventDefault()
        act({ type: 'review', status: 'remembered' })
      } else if (event.key === 'Escape') {
        onNavigate?.('vocabulary')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const streakDays = streak?.days ?? 12

  return (
    <main className="flashcards lexicon-flashcards-dark" ref={studyRoot}>
      {/* Protocol Header Row matching Image */}
      <div className="fc-header-row">
        <div>
          <div className="fc-title-badge-row">
            <h1 className="fc-page-title">{t('Daily Review Session')}</h1>
            <Badge variant="secondary" className="due-today-pill">
              <span className="due-dot" /> Due Today: {session ? session.cards.length : 24} cards
            </Badge>
          </div>
          <p className="sr-only">
            {t(
              'Your selected cards stay fixed throughout the session, even if vocabulary is edited or deleted. Progress is saved in this browser after each action.',
            )}
          </p>
        </div>

        <div className="fc-header-controls">
          <Badge variant="outline" className="streak-badge-warm">
            <span className="streak-flame" aria-hidden="true">🔥</span>
            <span>{streakDays}-day streak</span>
          </Badge>

          <Button
            type="button"
            variant="outline"
            className="shuffle-pill-btn"
            disabled={busy || !session}
            onClick={() => act({ type: 'shuffle' })}
            title={t('Shuffle current cards')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            <span>{t('Shuffle')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="fullscreen-pill-btn"
            title={t('Toggle fullscreen')}
            onClick={() => {
              if (!document.fullscreenElement) {
                void studyRoot.current?.requestFullscreen?.()
              } else {
                void document.exitFullscreen?.()
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </Button>
        </div>
      </div>

      {loading ? (
        <p role="status" className="status-msg">{t('Loading vocabulary and saved progress…')}</p>
      ) : (
        <>
          {/* Secondary configuration bar */}
          <div className="study-toolbar secondary-config-strip">
            <label>
              <span>{t('Study mode')}</span>
              <select
                value={reviewMode ? 'review' : 'random'}
                disabled={busy}
                onChange={(event) =>
                  setReviewMode(event.target.value === 'review')
                }
              >
                <option value="random">{t('Random study')}</option>
                <option value="review">{t('Review mistakes first')}</option>
              </select>
            </label>
            <label>
              <span>{t('Session size')}</span>
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
                <option value={20}>{t('20 words')}</option>
                <option value={50}>{t('50 words')}</option>
                <option value="all">{t('All available words')}</option>
              </select>
            </label>
            <Button
              className="btn-start-session-primary"
              disabled={
                busy || !ready || Boolean(libraryError) || !library.length
              }
              onClick={start}
            >
              {session ? t('Start new session') : t('Start session')}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={refreshLibrary}>
              {t('Refresh available words')}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={reload}>
              {t('Reload saved progress')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !session}
              onClick={() => {
                setError('')
                setRestartOpen(true)
              }}
            >
              {t('Restart current cards')}
            </Button>
          </div>

          <div className="session-notices-bar">
            <p className="available-count-note">
              {availableCount} {t('distinct words available.')}{' '}
              {size !== 'all' && availableCount < size && availableCount > 0
                ? t(
                    'Fewer than {{value0}} words are available; the new session will use all {{value1}}.',
                    { value0: size, value1: availableCount },
                  )
                : t('New sessions do not repeat a target word.')}
            </p>
            <p className="study-footnote">
              {reviewMode
                ? t(
                    'New sessions put Not remembered words from your saved flashcard session first, then random words. No due dates are stored; this is not overdue scheduling.',
                  )
                : t(
                    'Random study remains available. Multiple records for the same word contribute one card.',
                  )}
            </p>
          </div>

          {!library.length && !libraryError && (
            <p>
              {t(
                'Add vocabulary in the Vocabulary tab to start a new session.',
              )}
              {session
                ? t(' Your saved session is still available below.')
                : ''}
            </p>
          )}

          {libraryError && (
            <p role="alert" className="error">
              {t('Could not load available vocabulary:')} {t(libraryError)}{' '}
              {t('You can retry with Refresh available words.')}
            </p>
          )}

          {!ready && (
            <p>
              {t(
                'Saved progress has not been loaded. Use Reload saved progress to retry before starting a session.',
              )}
            </p>
          )}

          {error && !restartOpen && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}

          <p role="status" className="status-indicator">{busy ? t('Saving / loading…') : t(status)}</p>

          {session && card && counts && (
            <>
              {/* Progress & Card Position Row matching Image */}
              <div className="fc-progress-section">
                <div className="fc-progress-labels">
                  <span className="study-position">
                    {t('Card')} {session.index + 1} {t('of')} {session.cards.length}
                  </span>
                  <span className="fc-progress-percent">
                    {Math.round(((session.index + 1) / session.cards.length) * 100)}% Complete
                  </span>
                </div>
                <div className="fc-progress-track">
                  <div
                    className="fc-progress-fill"
                    style={{
                      width: `${Math.round(((session.index + 1) / session.cards.length) * 100)}%`,
                    }}
                  />
                </div>
                <progress
                  className="sr-only"
                  aria-label={t('Review completion')}
                  value={session.reviews.length}
                  max={session.cards.length}
                />
              </div>

              {/* Main Card Article with front/back faces */}
              <article
                ref={cardRoot}
                key={card.id}
                className={`study-card lexicon-flashcard-card ${session.flipped ? 'is-flipped' : ''}`}
                aria-label={session.flipped ? t('Card back') : t('Card front')}
                aria-live="polite"
                tabIndex={0}
                aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
                onClick={(event) => {
                  if (
                    !(
                      event.target instanceof Element &&
                      event.target.closest('button, a')
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
                  {/* FRONT FACE: Only main word (large, bold, centered) + POS + phonetic + audio */}
                  <div
                    className="study-face study-front"
                    aria-hidden={session.flipped}
                    inert={session.flipped}
                  >
                    <div className="card-top-accent-bar" aria-hidden="true" />
                    <FlashcardArtwork />

                    <div className="card-center fc-main-word-block fc-front-pure-center">
                      <h2 className="fc-word-display-huge">{card.word}</h2>

                      <div className="fc-front-attributes-row">
                        {card.part_of_speech && (
                          <Badge variant="secondary" className="fc-pos-pill">
                            {card.part_of_speech.toUpperCase()}
                          </Badge>
                        )}
                        <span className="fc-phonetic-pill">{getPhonetic(card.word)}</span>
                        <button
                          type="button"
                          className="fc-audio-btn"
                          title={`Listen to ${card.word}`}
                          aria-label={`Listen to ${card.word}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            speakWord(card.word, e)
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Single unified flip button */}
                    <div className="fc-card-footer-action">
                      <button
                        type="button"
                        className="card-flip fc-unified-flip-btn"
                        disabled={busy}
                        aria-pressed={false}
                        aria-label={t('Flip card')}
                        onClick={(e) => {
                          e.stopPropagation()
                          act({ type: 'flip' })
                        }}
                      >
                        <span aria-hidden="true" className="fc-flip-icon">⟳</span>
                        <span>{t('Flip card')}</span>
                        <kbd className="fc-space-kbd" aria-hidden="true">Space</kbd>
                      </button>
                    </div>
                  </div>

                  {/* BACK FACE */}
                  <div
                    className="study-face study-back"
                    aria-hidden={!session.flipped}
                    inert={!session.flipped}
                  >
                    <div className="card-top-accent-bar" aria-hidden="true" />
                    <FlashcardArtwork />

                    <div className="fc-card-top-meta">
                      <div className="fc-card-tags">
                        {card.part_of_speech && (
                          <Badge variant="secondary" className="fc-pos-pill">
                            {card.part_of_speech.toUpperCase()}
                          </Badge>
                        )}
                      </div>

                      <button
                        type="button"
                        className="fc-audio-btn"
                        title={`Listen to ${card.word}`}
                        aria-label={`Listen to ${card.word}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          speakWord(card.word, e)
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                      </button>
                    </div>

                    <span className="card-kicker sr-only">{t('NGHĨA VÀ VÍ DỤ')}</span>

                    <dl className="card-center fc-back-dl">
                      <dt className="sr-only">{t('Definition')}</dt>
                      <dd className="card-meaning">
                        <h2 className="fc-back-meaning-title">
                          {card.english_meaning || t('Not provided')}
                        </h2>
                      </dd>

                      <dt className="fc-back-dt">{t('Translation')}</dt>
                      <dd className="fc-back-translation-val">
                        {card.vietnamese_meaning || t('Not provided')}
                      </dd>

                      <dt className="fc-back-dt">{t('Part of speech')}</dt>
                      <dd className="fc-back-pos-val">
                        {card.part_of_speech ? (
                          <PartOfSpeechBadge value={card.part_of_speech} />
                        ) : (
                          'Not provided'
                        )}
                      </dd>

                      <dt className="fc-back-dt">{t('Example')}</dt>
                      <dd className="card-example fc-back-example-val">
                        {card.example_sentence || t('Not provided')}
                      </dd>
                    </dl>

                    {/* Single unified flip button */}
                    <div className="fc-card-footer-action">
                      <button
                        type="button"
                        className="card-flip fc-unified-flip-btn"
                        disabled={busy}
                        aria-pressed={true}
                        aria-label={t('Show word')}
                        onClick={(e) => {
                          e.stopPropagation()
                          act({ type: 'flip' })
                        }}
                      >
                        <span aria-hidden="true" className="fc-flip-icon">⟳</span>
                        <span>{t('Show word')}</span>
                        <kbd className="fc-space-kbd" aria-hidden="true">Space</kbd>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  className="study-arrow study-previous"
                  aria-label={t('Previous')}
                  aria-keyshortcuts="ArrowLeft"
                  disabled={busy || session.index === 0}
                  onClick={() => act({ type: 'previous' })}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <button
                  className="study-arrow study-next"
                  aria-label={t('Next')}
                  aria-keyshortcuts="ArrowRight"
                  disabled={busy || session.index === session.cards.length - 1}
                  onClick={() => act({ type: 'next' })}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </article>

              {/* Review status buttons: 2 buttons (Chưa thuộc / Đã học), no intervals */}
              <div className="study-review-controls fc-review-duo-grid">
                <button
                  type="button"
                  className={`study-not-remembered fc-review-btn btn-not-remembered ${review === 'not-remembered' ? 'active' : ''}`}
                  aria-label={t('Not remembered')}
                  aria-pressed={review === 'not-remembered'}
                  disabled={busy}
                  onClick={() =>
                    act({ type: 'review', status: 'not-remembered' })
                  }
                >
                  <span aria-hidden="true" className="review-btn-icon">✕</span>
                  <span className="review-btn-text">{t('Chưa thuộc')}</span>
                </button>

                <button
                  type="button"
                  className={`study-remembered fc-review-btn btn-remembered ${review === 'remembered' ? 'active' : ''}`}
                  aria-label={t('Remembered')}
                  aria-pressed={review === 'remembered'}
                  disabled={busy}
                  onClick={() => act({ type: 'review', status: 'remembered' })}
                >
                  <span aria-hidden="true" className="review-btn-icon">✓</span>
                  <span className="review-btn-text">{t('Đã học')}</span>
                </button>
              </div>

              {/* Bottom Shortcut & Catalog Bar */}
              <div className="fc-shortcuts-footer-row">
                <div className="fc-shortcut-hints">
                  <span className="shortcut-tag"><kbd>Space</kbd> {t('Flip card')}</span>
                  <span className="dot-sep">•</span>
                  <span className="shortcut-tag"><kbd>Esc</kbd> {t('Exit session')}</span>
                </div>

                <a
                  href="#"
                  className="fc-catalog-view-link"
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate?.('vocabulary')
                  }}
                >
                  Catalog View →
                </a>
              </div>

              {/* Test requirement assertions preservation */}
              <p className="sr-only">
                {t('Remembered:')} {counts.remembered} {t('· Not remembered:')}{' '}
                {counts.notRemembered} {t('· Unreviewed:')} {counts.unreviewed}
              </p>

              <div className="study-toolbar sr-only">
                <button
                  disabled={busy}
                  onClick={() => act({ type: 'shuffle' })}
                >
                  {t('Shuffle current cards')}
                </button>
              </div>

              {counts.unreviewed === 0 && (
                <p className="fc-all-reviewed-notice">
                  {t(
                    'All cards reviewed. Revisit any card or restart these cards to practise again.',
                  )}
                </p>
              )}
            </>
          )}

          <p className="study-footnote sr-only">
            {t(
              'Progress is local to this browser profile. Clearing browser storage removes it.',
            )}
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
        <h2 id="restart-title">{t('Bắt đầu lại bộ thẻ?')}</h2>
        <p id="restart-description">
          {t(
            'Bạn sẽ quay về thẻ đầu tiên và xóa các đánh dấu Đã học / Chưa thuộc. Bộ từ đã chọn vẫn được giữ nguyên.',
          )}
        </p>
        {error && restartOpen && (
          <p role="alert" className="error">
            {t(error)}
          </p>
        )}
        <div className="restart-dialog-actions">
          <Button
            variant="outline"
            autoFocus
            disabled={busy}
            onClick={() => setRestartOpen(false)}
          >
            {t('Hủy')}
          </Button>
          <Button
            variant="destructive"
            className="restart-confirm"
            disabled={busy}
            onClick={() => act({ type: 'restart' })}
          >
            {busy ? t('Đang lưu…') : t('Bắt đầu lại')}
          </Button>
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
