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

export function Quiz({
  repository,
  progress,
  active = true,
}: {
  repository: VocabularyRepository
  progress: QuizProgressRepository
  active?: boolean
}) {
  const [saved, setSaved] = useState<SavedQuiz | null>(null)
  const [size, setSize] = useState<QuizSize>(10)
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
        'Start a new quiz? This replaces your saved quiz and review progress.',
      )
    )
      return
    setAutoAdvance(null)
    void run(async () => {
      const generated = generateQuiz(await repository.list(), size)
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
    setAutoAdvance(null)
    void run(async () => {
      const next = await progress.save(
        quizTransition(saved.session, action),
        saved.revision,
      )
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
  const advanceDelay = submitted === question?.correctIndex ? 1500 : 2500
  useEffect(() => {
    if (
      !active ||
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
    <main className="quiz-page">
      <header>
        <p className="eyebrow">ENGLISH LEARNING HUB / VOCABULARY QUIZ</p>
        <h1>Test your vocabulary</h1>
        <p>
          Choose the English meaning. Each word appears once; questions and
          answer positions stay fixed throughout your quiz.
        </p>
      </header>
      {loading ? (
        <p role="status">Loading saved quiz…</p>
      ) : (
        <>
          <div className="quiz-toolbar">
            <label>
              Quiz size
              <select
                value={size}
                disabled={busy}
                onChange={(event) =>
                  setSize(
                    event.target.value === 'all'
                      ? 'all'
                      : (Number(event.target.value) as 10 | 20 | 50),
                  )
                }
              >
                <option value={10}>10 questions</option>
                <option value={20}>20 questions</option>
                <option value={50}>50 questions</option>
                <option value="all">All eligible questions</option>
              </select>
            </label>
            <button disabled={busy || !ready} onClick={start}>
              {session ? 'Start new quiz' : 'Start quiz'}
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
              Reload saved quiz
            </button>
          </div>
          <p className="quiz-help">
            Needs at least four distinct, unrelated English meanings. Similar
            parts of speech and #tags in notes are preferred. Ambiguous choices
            are excluded using spelling, meaning overlap and known or declared
            synonyms.
          </p>
          {!ready && (
            <p>
              Load saved progress successfully before starting a quiz. Use
              Reload saved quiz to retry.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p role="status">{busy ? 'Saving / loading…' : status}</p>
          {session && question && results && (
            <>
              {session.requestedSize !== 'all' &&
                session.questions.length < session.requestedSize && (
                  <p>
                    Only {session.eligibleCount} words have enough safe
                    distractors. This quiz uses all {session.questions.length}{' '}
                    eligible questions.
                  </p>
                )}
              {session.finished ? (
                <section className="quiz-card" aria-label="Quiz results">
                  <h2>Quiz complete</h2>
                  <p className="quiz-score">
                    Score: {results.correct} / {results.total}
                  </p>
                  <h3>Missed vocabulary ({results.missed.length})</h3>
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
                    <p>No missed words. Well done!</p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => act({ type: 'review' })}
                  >
                    Review answers
                  </button>
                </section>
              ) : (
                <>
                  <p>
                    Question {session.index + 1} of {session.questions.length} ·
                    Score: {results.correct} / {results.answered} answered
                  </p>
                  <section className="quiz-card" aria-label="Quiz question">
                    <h2>{question.target.word}</h2>
                    <p>Which English meaning matches this word?</p>
                    <fieldset disabled={busy || submitted !== null}>
                      <legend className="sr-only">Answer options</legend>
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
                                  act({ type: 'submit', choice: index })
                                }
                              }}
                              onClick={() => {
                                if (
                                  error &&
                                  selected === index &&
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
                            <span>{option}</span>
                            {submitted !== null &&
                              index === question.correctIndex && (
                                <strong>Correct answer</strong>
                              )}
                            {submitted === index &&
                              index !== question.correctIndex && (
                                <strong>Your answer</strong>
                              )}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {submitted !== null ? (
                      <p className="quiz-feedback" role="status">
                        {submitted === question.correctIndex
                          ? 'Correct!'
                          : 'Not quite.'}{' '}
                        Correct answer:{' '}
                        {question.options[question.correctIndex]}
                      </p>
                    ) : null}
                    {active &&
                      !busy &&
                      !error &&
                      autoAdvance?.id === session.id &&
                      autoAdvance.index === session.index && (
                        <div
                          className="quiz-countdown"
                          role="img"
                          aria-label="Thời gian còn lại trước khi tự chuyển câu"
                        >
                          <span
                            key={`${session.id}-${session.index}`}
                            className="quiz-countdown-fill"
                            style={{ animationDuration: `${advanceDelay}ms` }}
                          />
                        </div>
                      )}
                  </section>
                  <div className="quiz-toolbar">
                    <button
                      disabled={busy || session.index === 0}
                      onClick={() => act({ type: 'previous' })}
                    >
                      Previous question
                    </button>
                    {session.index < session.questions.length - 1 ? (
                      <button
                        disabled={busy || submitted === null}
                        onClick={() => act({ type: 'next' })}
                      >
                        Next question
                      </button>
                    ) : (
                      <button
                        disabled={busy || submitted === null}
                        onClick={() => act({ type: 'finish' })}
                      >
                        Finish quiz
                      </button>
                    )}
                  </div>
                  <progress
                    aria-label="Quiz completion"
                    value={results.answered}
                    max={results.total}
                  />
                  <p>
                    Missed so far: {results.missed.length}. Submitted answers
                    are locked; revisit any answered question to review its
                    correct answer.
                  </p>
                </>
              )}
            </>
          )}
          <p className="quiz-help">
            Submitted answers and review progress are saved in this browser.
            Clearing browser storage removes them. Rule-based similarity checks
            cannot recognize every possible paraphrase; clear definitions and
            accurate synonyms improve question quality.
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
