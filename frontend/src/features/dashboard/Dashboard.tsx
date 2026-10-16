import { useEffect, useState } from 'react'
import { calculateMetrics, type DashboardMetrics } from './metrics'
import type { DashboardRepository } from './repository'
import { MetricCard } from './MetricCard'
import './dashboard.css'

export function Dashboard({ repository }: { repository: DashboardRepository }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const unsubscribe = repository.subscribe(
      (snapshot) => {
        if (active) {
          setMetrics(calculateMetrics(snapshot))
          setError('')
        }
      },
      (reason) => {
        if (active) {
          setMetrics(null)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load learning data. Please retry.',
          )
        }
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, attempt])
  return (
    <main className="learning-dashboard">
      <header className="dashboard-heading">
        <p className="eyebrow">YOUR LEARNING</p>
        <h1>Learning Dashboard</h1>
      </header>
      <section className="dashboard-welcome" aria-labelledby="welcome-title">
        <div>
          <span className="welcome-tag">A LITTLE BETTER EVERY DAY</span>
          <h2 id="welcome-title">Welcome back, learner!</h2>
          <p>
            Grow your vocabulary, build your confidence.
            <br />
            Your next learning moment starts here.
          </p>
          <div className="welcome-summary">
            <span className="welcome-number">
              {metrics ? metrics.total : '—'}
            </span>
            <div>
              <strong>words in your collection</strong>
              <span>Make room for a new word today.</span>
            </div>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-card-back">
            Aa<span>vocabulary</span>
          </div>
          <div className="art-card art-card-front">
            Hello<span>/həˈləʊ/</span>
            <i>a small word, a new beginning</i>
          </div>
          <span className="art-spark">✦</span>
        </div>
      </section>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              setError('')
              setMetrics(null)
              setAttempt((value) => value + 1)
            }}
          >
            Retry dashboard
          </button>
        </div>
      ) : !metrics ? (
        <p role="status">Loading saved learning data…</p>
      ) : (
        <>
          {metrics.total === 0 && (
            <section className="dashboard-panel">
              <h2>Start your vocabulary collection</h2>
              <p>
                Add words or import an XLSX file in Vocabulary, then start a
                flashcard session or quiz. Your saved activity will appear here.
              </p>
            </section>
          )}
          <div className="dashboard-overview">
            <section
              className="dashboard-stats"
              aria-labelledby="overview-title"
            >
              <div className="panel-heading">
                <h2 id="overview-title">Your vocabulary at a glance</h2>
                <span>Saved learning data</span>
              </div>
              <div className="dashboard-grid">
                <MetricCard
                  label="Total vocabulary"
                  value={metrics.total}
                  detail="Current vocabulary entries, including separate meanings of the same word."
                />
                <MetricCard
                  label="New words"
                  value={metrics.newWords}
                  detail="No review mark or submitted quiz answer in the saved sessions."
                />
                <MetricCard
                  label="Learning words"
                  value={metrics.learning}
                  detail="Studied entries that do not meet the saved-session learned rule."
                />
                <MetricCard
                  label="Learned words"
                  value={metrics.learned}
                  detail="Marked remembered in flashcards, with no incorrect answer in the saved quiz."
                />
                <MetricCard
                  label="Due for review today"
                  value="Unavailable"
                  detail="The app does not yet persist an SRS schedule or review due dates."
                />
                <MetricCard
                  label="Quiz accuracy"
                  value={
                    metrics.accuracy === null
                      ? 'No answers yet'
                      : `${metrics.accuracy.toFixed(1)}%`
                  }
                  detail={
                    metrics.quiz?.answered
                      ? `${metrics.quiz.correct} correct of ${metrics.quiz.answered} submitted answers in the saved quiz. Unanswered questions are excluded.`
                      : 'Answer a quiz question to see your accuracy.'
                  }
                />
              </div>
            </section>
            <section
              className="dashboard-panel"
              aria-labelledby="dashboard-progress-title"
            >
              <h2 id="dashboard-progress-title">Current learning progress</h2>
              <p>
                {metrics.learned} of {metrics.total} current entries meet the
                learned rule.
              </p>
              <meter
                min={0}
                max={metrics.total || 1}
                value={metrics.learned}
                aria-label="Current entries meeting the learned rule"
              />
              <p>
                These categories use only retained sessions, not lifetime
                mastery or SRS status. A missed answer takes precedence when
                results conflict. Entries selected but not reviewed stay new.
                Starting a new session or restarting flashcards can change these
                counts.
              </p>
            </section>
          </div>
          <section
            className="dashboard-panel"
            aria-labelledby="dashboard-activity-title"
          >
            <h2 id="dashboard-activity-title">Recent study activity</h2>
            <p>
              Only the current saved flashcard session and quiz are retained.
              Study timestamps are not stored, so this activity cannot be dated
              or ordered by recency.
            </p>
            {!metrics.flashcards && !metrics.quiz ? (
              <p>
                No saved study sessions yet. Study some flashcards or start a
                quiz to begin.
              </p>
            ) : (
              <ul className="dashboard-activity">
                {metrics.flashcards && (
                  <li>
                    <h3>Saved flashcard session</h3>
                    <p>
                      {metrics.flashcards.remembered} remembered ·{' '}
                      {metrics.flashcards.notRemembered} not remembered ·{' '}
                      {metrics.flashcards.unreviewed} unreviewed of{' '}
                      {metrics.flashcards.total} cards.
                    </p>
                  </li>
                )}
                {metrics.quiz && (
                  <li>
                    <h3>
                      Saved quiz ·{' '}
                      {metrics.quiz.finished ? 'Completed' : 'In progress'}
                    </h3>
                    <p>
                      {metrics.quiz.answered} of {metrics.quiz.total} answered ·{' '}
                      {metrics.quiz.correct} correct ·{' '}
                      {metrics.quiz.answered - metrics.quiz.correct} missed.
                    </p>
                  </li>
                )}
              </ul>
            )}
            {(metrics.flashcards || metrics.quiz) && (
              <p>
                Saved session totals include word snapshots removed from the
                library. Word categories above count only entries still in your
                library.
              </p>
            )}
          </section>
          <section className="dashboard-panel">
            <h2>Learning progress over time</h2>
            <p>
              Historical learning data is not available. The app does not store
              dated review events or previous quizzes, so a timeline cannot be
              calculated from the existing data.
            </p>
          </section>
        </>
      )}
    </main>
  )
}
