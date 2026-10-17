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
import './quiz.css'
import { normalizeStudyText } from '../../lib/study'

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
    let active = true
    progress
      .load()
      .then((stored) => {
        if (active) {
          setSaved(stored)
          setReady(true)
          setStatus(stored ? 'Resumed your saved quiz.' : '')
        }
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
  return (
    <main className="quiz-page" ref={quizRoot}>
      <header>
        <p className="eyebrow">{t('ENGLISH LEARNING HUB / VOCABULARY QUIZ')}</p>
        <h1>{t('Test your vocabulary')}</h1>
        <p>
          {t(
            'Choose the English meaning. Each word appears once; questions and answer positions stay fixed throughout your quiz.',
          )}
        </p>
      </header>
      {loading ? (
        <p role="status">{t('Loading saved quiz…')}</p>
      ) : (
        <>
          <div className="quiz-toolbar">
            <label>
              {t('Study mode')}
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
              {t('Quiz size')}
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
            <button disabled={busy || !ready} onClick={start}>
              {session ? t('Start new quiz') : t('Start quiz')}
            </button>
            <button
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
            </button>
          </div>
          <label className="quiz-auto-advance">
            <input
              type="checkbox"
              checked={autoAdvanceEnabled}
              onChange={(event) => setAutoAdvanceEnabled(event.target.checked)}
            />{' '}
            {t('Automatically advance after feedback')}
          </label>
          {reviewMode && (
            <p className="quiz-help">
              {t(
                'New quizzes prioritize incorrect words from your saved quiz, then random eligible words. No due dates are stored; this is not overdue scheduling. Ambiguous words may still be skipped.',
              )}
            </p>
          )}
          <p className="quiz-help">
            {t(
              'Needs at least four distinct, unrelated English meanings. Similar parts of speech and #tags in notes are preferred. Ambiguous choices are excluded using spelling, meaning overlap and known or declared synonyms.',
            )}
          </p>
          {!ready && (
            <p>
              {t(
                'Load saved progress successfully before starting a quiz. Use Reload saved quiz to retry.',
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
          <p role="status">{busy ? t('Saving / loading…') : t(status)}</p>
          {session && question && results && (
            <>
              {session.requestedSize !== 'all' &&
                session.questions.length < session.requestedSize && (
                  <p>
                    {t('Only')} {session.eligibleCount}{' '}
                    {t(
                      'words have enough safe distractors. This quiz uses all',
                    )}{' '}
                    {session.questions.length} {t('eligible questions.')}
                  </p>
                )}
              {session.finished ? (
                <section className="quiz-card" aria-label={t('Quiz results')}>
                  <h2>{t('Quiz complete')}</h2>
                  <p className="quiz-score">
                    {t('Score:')} {results.correct} / {results.total}
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
                            <span>{word.vietnamese_meaning}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('No missed words. Well done!')}</p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => act({ type: 'review' })}
                  >
                    {t('Review answers')}
                  </button>
                </section>
              ) : (
                <>
                  <p>
                    {t('Question')} {session.index + 1} {t('of')}{' '}
                    {session.questions.length} {t('· Score:')} {results.correct}{' '}
                    / {results.answered} {t('answered')}
                  </p>
                  <section
                    className="quiz-card"
                    aria-label={t('Quiz question')}
                  >
                    <h2 ref={questionHeading} tabIndex={-1}>
                      {question.target.word}
                    </h2>
                    <p>{t('Which English meaning matches this word?')}</p>
                    <p className="quiz-help">
                      {t(
                        'Click an answer to submit. With a keyboard, use arrow keys to choose, then Tab to Submit selected answer. Turn off automatic advance for more reading time.',
                      )}
                    </p>
                    <fieldset disabled={busy || submitted !== null}>
                      <legend className="sr-only">{t('Answer options')}</legend>
                      <div className="quiz-options">
                        {question.options.map((option, index) => (
                          <label
                            key={`${session.index}-${index}`}
                            className={`quiz-option ${submitted !== null && index === question.correctIndex ? 'quiz-correct' : submitted === index && index !== question.correctIndex ? 'quiz-incorrect' : ''}`}
                          >
                            <input
                              type="radio"
                              name="quiz-answer"
                              checked={(submitted ?? selected) === index}
                              onChange={() => {
                                if (
                                  !busy &&
                                  submitted === null &&
                                  !locked.current
                                ) {
                                  setSelected(index)
                                }
                              }}
                              onClick={(event) => {
                                if (
                                  event.detail > 0 &&
                                  !busy &&
                                  submitted === null &&
                                  !locked.current
                                ) {
                                  setSelected(index)
                                  act({ type: 'submit', choice: index })
                                }
                              }}
                            />
                            <span className="quiz-letter" aria-hidden="true">
                              {String.fromCharCode(65 + index)}
                            </span>
                            <span className="quiz-answer-text">
                              <span>{option}</span>
                              {submitted !== null && (
                                <small className="quiz-answer-translation">
                                  {question.translations?.[index] ||
                                    (index === question.correctIndex
                                      ? question.target.vietnamese_meaning
                                      : session.questions.find(
                                          (entry) =>
                                            entry.target.english_meaning ===
                                            option,
                                        )?.target.vietnamese_meaning) ||
                                    t('Not provided')}
                                </small>
                              )}
                            </span>
                            {submitted !== null &&
                              index === question.correctIndex && (
                                <strong>{t('Correct answer')}</strong>
                              )}
                            {submitted === index &&
                              index !== question.correctIndex && (
                                <strong>{t('Your answer')}</strong>
                              )}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {submitted === null && selected !== null && (
                      <button
                        className="quiz-primary"
                        disabled={busy}
                        onClick={() =>
                          act({ type: 'submit', choice: selected })
                        }
                      >
                        {t('Submit selected answer')}
                      </button>
                    )}
                    {submitted !== null ? (
                      <p className="quiz-feedback" role="status">
                        {submitted === question.correctIndex
                          ? t('Correct!')
                          : t('Not quite.')}{' '}
                        {t('Correct answer:')}{' '}
                        {question.options[question.correctIndex]}
                      </p>
                    ) : null}
                    {active &&
                      autoAdvanceEnabled &&
                      !busy &&
                      !error &&
                      autoAdvance?.id === session.id &&
                      autoAdvance.index === session.index && (
                        <div
                          className="quiz-countdown"
                          role="img"
                          aria-label={t(
                            'Thời gian còn lại trước khi tự chuyển câu',
                          )}
                        >
                          <span
                            key={`${session.id}-${session.index}`}
                            className="quiz-countdown-fill"
                            style={{ animationDuration: `${advanceDelay}ms` }}
                          />
                        </div>
                      )}
                  </section>
                  <div className="quiz-toolbar quiz-navigation">
                    <button
                      disabled={busy || session.index === 0}
                      onClick={() => act({ type: 'previous' })}
                    >
                      {t('Previous question')}
                    </button>
                    {session.index < session.questions.length - 1 ? (
                      <button
                        disabled={busy || submitted === null}
                        onClick={() => act({ type: 'next' })}
                      >
                        {t('Next question')}
                      </button>
                    ) : (
                      <button
                        disabled={busy || submitted === null}
                        onClick={() => act({ type: 'finish' })}
                      >
                        {t('Finish quiz')}
                      </button>
                    )}
                  </div>
                  <progress
                    aria-label={t('Quiz completion')}
                    value={results.answered}
                    max={results.total}
                  />
                  <p>
                    {t('Missed so far:')} {results.missed.length}
                    {t(
                      '. Submitted answers are locked; revisit any answered question to review its correct answer.',
                    )}
                  </p>
                </>
              )}
            </>
          )}
          <p className="quiz-help">
            {t(
              'Submitted answers and review progress are saved in this browser. Clearing browser storage removes them. Rule-based similarity checks cannot recognize every possible paraphrase; clear definitions and accurate synonyms improve question quality.',
            )}
          </p>
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
