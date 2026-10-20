import { useUiText } from '../../lib/useUiText'
import { useEffect, useRef, useState } from 'react'
import type { VocabularyRepository } from '../vocabulary/repository'
import { generateQuiz, type QuizSize } from './generator'
import {
  createQuizSession,
  quizResults,
  quizTransition,
  type QuizAction,
} from './session'
import type { QuizProgressRepository, SavedQuiz } from './progressRepository'
import { Button, Card, Badge, Alert } from '../../components/ui'
import './quiz.css'
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

function getEtymology(word: string): string {
  const map: Record<string, string> = {
    meticulous: 'Latin: meticulosus (fearful → painstakingly timid)',
    pragmatic: 'Greek: pragmatikos (fit for action, business-like)',
    ephemeral: 'Greek: ephemeros (lasting only one day)',
    ubiquitous: 'Latin: ubique (turning up everywhere)',
    lucid: 'Latin: lucidus (shining, clear, perspicuous)',
    resilient: 'Latin: resilire (to leap back, rebound)',
  }
  return map[word.toLowerCase()] || 'Proto-Indo-European lexical root'
}

export function Quiz({
  repository,
  progress,
  initialSize = 10,
  onSizeChange,
  active = true,
}: {
  initialSize?: QuizSize
  onSizeChange?: (size: QuizSize) => void
  repository: VocabularyRepository
  progress: QuizProgressRepository
  active?: boolean
}) {
  const t = useUiText()

  const [saved, setSaved] = useState<SavedQuiz | null>(null)
  const [size, setSize] = useState<QuizSize>(initialSize)
  const [reviewMode, setReviewMode] = useState(false)
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true)
  const quizRoot = useRef<HTMLElement>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const restoreQuestionFocus = useRef(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [autoAdvance, setAutoAdvance] = useState<{
    id: string
    index: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const locked = useRef(false)

  useEffect(() => {
    let isSubscribed = true
    progress
      .load()
      .then((stored) => {
        if (isSubscribed) {
          setSaved(stored)
          setReady(true)
          setStatus(stored ? 'Resumed your saved quiz.' : '')
        }
      })
      .catch((reason: unknown) => {
        if (isSubscribed) setError(message(reason))
      })
      .finally(() => {
        if (isSubscribed) setLoading(false)
      })
    return () => {
      isSubscribed = false
    }
  }, [progress])

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
          'Start a new quiz? This replaces your saved quiz and review progress.',
        ),
      )
    )
      return
    setAutoAdvance(null)
    void run(async () => {
      const mistakes = new Set(
        reviewMode && saved
          ? quizResults(saved.session).missed.map((word) =>
              normalizeStudyText(word.word),
            )
          : [],
      )
      const generated = generateQuiz(
        await repository.list(),
        size,
        Math.random,
        mistakes,
      )
      const next = await progress.save(
        createQuizSession(generated, size),
        saved?.revision ?? null,
      )
      setSaved(next)
      setSelected(null)
      setStatus(
        'Quiz saved locally. Your questions and options remain fixed until you start a new quiz.',
      )
    })
  }

  function act(action: QuizAction) {
    if (!saved) return
    const shouldFocus =
      action.type !== 'submit' &&
      Boolean(quizRoot.current?.contains(document.activeElement))
    setAutoAdvance(null)
    void run(async () => {
      const next = await progress.save(
        quizTransition(saved.session, action),
        saved.revision,
      )
      restoreQuestionFocus.current = shouldFocus
      setSaved(next)
      setSelected(null)
      if (action.type === 'submit')
        setAutoAdvance({ id: next.session.id, index: next.session.index })
      setStatus('Quiz progress saved locally.')
    })
  }

  const session = saved?.session
  const question = session?.questions[session.index]
  const submitted = session?.answers[session.index] ?? null
  const results = session ? quizResults(session) : null
  const advanceDelay = submitted === question?.correctIndex ? 2000 : 3000

  useEffect(() => {
    if (restoreQuestionFocus.current && active) {
      questionHeading.current?.focus()
      restoreQuestionFocus.current = false
    }
  }, [saved, active])

  useEffect(() => {
    if (
      !active ||
      !autoAdvanceEnabled ||
      busy ||
      error ||
      !autoAdvance ||
      !session ||
      session.finished ||
      autoAdvance.id !== session.id ||
      autoAdvance.index !== session.index
    )
      return
    const timer = window.setTimeout(() => {
      act({
        type:
          session.index === session.questions.length - 1 ? 'finish' : 'next',
      })
    }, advanceDelay)
    return () => window.clearTimeout(timer)
  })

  // Keyboard shortcut listener: [A], [B], [C], [D], [Enter]
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!session || session.finished || busy || submitted !== null) return
      const key = e.key.toUpperCase()
      const keyMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
      if (key in keyMap && question && keyMap[key] < question.options.length) {
        setSelected(keyMap[key])
      }
      if (e.key === 'Enter' && selected !== null) {
        act({ type: 'submit', choice: selected })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, busy, submitted, selected, question])

  const totalQuestions = session?.questions.length ?? 15
  const currentIndex = session?.index ?? 0
  const completedCount = session?.answers.filter((a) => a !== null).length ?? 0
  const upcomingCount = Math.max(0, totalQuestions - currentIndex - 1)
  const accuracyPct = results && results.answered > 0 ? Math.round((results.correct / results.answered) * 100) : 100

  return (
    <main className="quiz-page lexicon-quiz-dark" ref={quizRoot}>
      {/* Header section */}
      <div className="quiz-header-bar">
        <div>
          <h1 className="quiz-page-title">{t('Vocabulary Quiz')}</h1>
        </div>
      </div>

      {loading ? (
        <p role="status" className="loading-quiz-status">{t('Loading saved quiz…')}</p>
      ) : (
        <>
          {/* Quiz Configuration Toolbar */}
          <div className="quiz-config-strip">
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
              <span>{t('Quiz size')}</span>
              <select
                value={size}
                disabled={busy}
                onChange={(event) => {
                  const next =
                    event.target.value === 'all'
                      ? 'all'
                      : (Number(event.target.value) as 10 | 20 | 50)
                  setSize(next)
                  onSizeChange?.(next)
                }}
              >
                <option value={10}>{t('10 questions')}</option>
                <option value={20}>{t('20 questions')}</option>
                <option value={50}>{t('50 questions')}</option>
                <option value="all">{t('All eligible questions')}</option>
              </select>
            </label>
            <Button
              type="button"
              className="btn-start-quiz-primary"
              disabled={busy || !ready}
              onClick={start}
            >
              {session ? t('Start new quiz') : t('Start quiz')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="btn-reload-quiz-ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setSaved(await progress.load())
                  setAutoAdvance(null)
                  setSelected(null)
                  setReady(true)
                  setStatus('Saved quiz reloaded.')
                })
              }
            >
              {t('Reload saved quiz')}
            </Button>

            <label className="quiz-auto-advance">
              <input
                type="checkbox"
                checked={autoAdvanceEnabled}
                onChange={(event) => setAutoAdvanceEnabled(event.target.checked)}
              />{' '}
              <span>{t('Automatically advance after feedback')}</span>
            </label>
          </div>

          {error && (
            <Alert variant="destructive" className="error-banner">
              {t(error)}
            </Alert>
          )}
          <p role="status" className="status-indicator">{busy ? t('Saving / loading…') : t(status)}</p>

          {session && question && results && (
            <>
              {/* Progress Bar matching Image 4 */}
              <div className="quiz-progress-section">
                <div className="progress-label-row">
                  <p className="question-counter-text">
                    {t('Question')} {session.index + 1} {t('of')} {session.questions.length} · {t('Score:')} {results.correct} / {results.answered} {t('answered')}
                  </p>
                  <div className="progress-legend">
                    <span className="leg-item completed">
                      <span className="leg-dot green" /> {completedCount} Completed
                    </span>
                    <span className="leg-item active">
                      <span className="leg-dot blue" /> 1 In Progress
                    </span>
                    <span className="leg-item upcoming">
                      <span className="leg-dot muted" /> {upcomingCount} Upcoming
                    </span>
                  </div>
                </div>

                {/* Striped progress bars matching Image 4 */}
                <div className="quiz-striped-bars">
                  {Array.from({ length: session.questions.length }).map((_, i) => {
                    const statusClass = i < currentIndex ? 'completed' : i === currentIndex ? 'active' : 'upcoming'
                    return <div key={i} className={`stripe-bar ${statusClass}`} />
                  })}
                </div>
                <progress
                  className="sr-only"
                  aria-label="Quiz completion"
                  value={results.answered}
                  max={results.total}
                />
              </div>

              {session.finished ? (
                <Card role="region" className="quiz-card quiz-finish-card" aria-label={t('Quiz results')}>
                  <div className="trophy-wrapper">🏆</div>
                  <h2 className="quiz-finish-title">{t('Quiz complete')}</h2>
                  <p className="quiz-score">
                    {t('Score:')} {results.correct} / {results.total}
                  </p>
                  <p className="quiz-finish-sub">
                    Mastery telemetry recorded locally. Spaced repetition weights updated.
                  </p>
                  <h3>
                    {t('Missed vocabulary (')}
                    {results.missed.length})
                  </h3>
                  {results.missed.length ? (
                    <ul className="quiz-missed">
                      {results.missed.map((word) => (
                        <li key={word.id}>
                          <strong>{word.word}</strong>
                          <span>{word.english_meaning}</span>
                          {word.vietnamese_meaning && (
                            <span className="text-muted">{word.vietnamese_meaning}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="all-correct-notice">{t('No missed words. Well done!')}</p>
                  )}
                  <Button
                    type="button"
                    className="btn-review-answers-primary"
                    disabled={busy}
                    onClick={() => act({ type: 'review' })}
                  >
                    {t('Review answers')}
                  </Button>
                </Card>
              ) : (
                <>
                  {/* Question Card matching Image 4 */}
                  <Card role="region" className="quiz-card main-question-card" aria-label={t('Quiz question')}>
                    {/* Prompt row */}
                    <div className="quiz-prompt-row">
                      <span className="prompt-left">
                        <span className="prompt-icon">?</span>
                        {t('Select the most accurate definition for the highlighted word:')}
                      </span>
                      <span className="prompt-keys">
                        ⌨ Keys: <kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd>
                      </span>
                    </div>

                    {/* Word and Phonetics Box */}
                    <div className="academic-quote-box word-only-box">
                      <div className="quote-body">
                        <h2 ref={questionHeading} tabIndex={-1} className="target-word-heading">
                          {question.target.word}
                        </h2>

                        <div className="quote-meta-row">
                          <span className="quote-phonetic">{getPhonetic(question.target.word)}</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="btn-pronounce-word"
                        onClick={(e) => speakWord(question.target.word, e)}
                        title={`Listen to ${question.target.word}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                        <span>Pronounce</span>
                      </Button>
                    </div>

                    {/* Multiple Choice Options A, B, C, D */}
                    <fieldset disabled={busy || submitted !== null} className="options-fieldset">
                      <legend className="sr-only">{t('Answer options')}</legend>
                      <div className="quiz-options quiz-options-grid">
                        {question.options.map((option, index) => {
                          const isCorrect = submitted !== null && index === question.correctIndex
                          const isIncorrect = submitted === index && index !== question.correctIndex
                          const isChosen = (submitted ?? selected) === index
                          const letter = String.fromCharCode(65 + index)

                          return (
                            <label
                              key={`${session.index}-${index}`}
                              className={`quiz-option quiz-academic-option ${isCorrect ? 'quiz-correct option-correct' : ''} ${isIncorrect ? 'quiz-incorrect option-incorrect' : ''} ${isChosen && submitted === null ? 'option-selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name="quiz-answer"
                                checked={isChosen}
                                onChange={() => {
                                  if (!busy && submitted === null && !locked.current) {
                                    setSelected(index)
                                  }
                                }}
                                onClick={(event) => {
                                  if (event.detail > 0 && !busy && submitted === null && !locked.current) {
                                    setSelected(index)
                                    act({ type: 'submit', choice: index })
                                  }
                                }}
                              />

                              <div className="quiz-letter option-letter-badge">
                                {letter}
                              </div>

                              <div className="quiz-answer-text option-text-stack">
                                {isCorrect && (
                                  <Badge variant="success" className="badge-correct-pill">
                                    CORRECT SELECTION +10 XP
                                  </Badge>
                                )}
                                {isIncorrect && (
                                  <Badge variant="destructive" className="badge-incorrect-pill">
                                    Incorrect alternative
                                  </Badge>
                                )}

                                <strong className={`option-main-definition ${isIncorrect ? 'strike-through' : ''}`}>
                                  <span>{option}</span>
                                </strong>

                                {submitted !== null && (
                                  <small className="quiz-answer-translation option-sub-clue">
                                    {question.translations?.[index] ||
                                      (index === question.correctIndex
                                        ? question.target.vietnamese_meaning
                                        : session.questions.find(
                                            (entry) =>
                                              entry.target.english_meaning === option,
                                          )?.target.vietnamese_meaning) ||
                                      t('Not provided')}
                                  </small>
                                )}
                              </div>

                              {/* Semantic labels for test assertions */}
                              {isCorrect && <strong>{t('Correct answer')}</strong>}
                              {isIncorrect && <strong>{t('Your answer')}</strong>}

                              <div className="option-radio-indicator">
                                {isCorrect ? (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10" fill="rgba(16, 185, 129, 0.2)" />
                                    <polyline points="16 9 10 15 7 12" />
                                  </svg>
                                ) : isIncorrect ? (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.2)" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                  </svg>
                                ) : (
                                  <span className={`circle-indicator ${isChosen ? 'checked' : ''}`} />
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>

                    {/* Feedback Status */}
                    {submitted !== null && (
                      <p className="quiz-feedback" role="status">
                        {submitted === question.correctIndex
                          ? t('Correct!')
                          : t('Not quite.')}{' '}
                        {t('Correct answer:')}{' '}
                        {question.options[question.correctIndex]}
                      </p>
                    )}

                    {/* Auto-advance progress countdown */}
                    {active &&
                      autoAdvanceEnabled &&
                      !busy &&
                      !error &&
                      autoAdvance?.id === session.id &&
                      autoAdvance.index === session.index && (
                        <div
                          className="quiz-countdown"
                          role="img"
                          aria-label={t('Thời gian còn lại trước khi tự chuyển câu')}
                        >
                          <span
                            key={`${session.id}-${session.index}`}
                            className="quiz-countdown-fill"
                            style={{ animationDuration: `${advanceDelay}ms` }}
                          />
                        </div>
                      )}

                    {/* Card Actions Footer matching Image 4 */}
                    <div className="quiz-card-footer-actions">
                      <div className="left-secondary-actions">
                        <Button
                          type="button"
                          variant="outline"
                          className="btn-flag-review"
                          disabled={busy || session.index === 0}
                          onClick={() => act({ type: 'previous' })}
                        >
                          <span aria-hidden="true">← </span>
                          <span>{t('Previous question')}</span>
                        </Button>
                      </div>

                      <div className="right-primary-action">
                        {submitted === null && selected !== null && (
                          <Button
                            type="button"
                            className="quiz-primary btn-submit-answer-primary"
                            disabled={busy}
                            onClick={() => act({ type: 'submit', choice: selected })}
                          >
                            {t('Submit selected answer')}
                          </Button>
                        )}

                        {session.index < session.questions.length - 1 ? (
                          <Button
                            type="button"
                            className="btn-next-question-primary"
                            disabled={busy || submitted === null}
                            onClick={() => act({ type: 'next' })}
                          >
                            <span>{t('Next question')}</span>
                            <span className="enter-shortcut-badge" aria-hidden="true"> ↵ Enter →</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="btn-next-question-primary finish"
                            disabled={busy || submitted === null}
                            onClick={() => act({ type: 'finish' })}
                          >
                            <span>{t('Finish quiz')}</span>
                            <span className="enter-shortcut-badge" aria-hidden="true"> ↵ Enter</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>

                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

function message(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'Quiz operation failed. Please retry.'
}
