import { useUiText } from '../../lib/useUiText'
import { useEffect, useState } from 'react'
import { calculateMetrics, type DashboardMetrics } from './metrics'
import type { DashboardRepository } from './repository'
import { MetricCard } from './MetricCard'
import type { VisitStreak } from './useVisitStreak'
import './dashboard.css'

export function Dashboard({
  repository,
  streak,
  onNavigate,
}: {
  repository: DashboardRepository
  streak?: VisitStreak
  onNavigate?: (destination: 'vocabulary' | 'flashcards') => void
}) {
  const t = useUiText()

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
        <p className="eyebrow">{t('YOUR LEARNING')}</p>
        <h1>{t('Learning Dashboard')}</h1>
      </header>
      {streak && (
        <section className="dashboard-streak" aria-label={t('Visit streak')}>
          <span className="streak-fire" aria-hidden="true">
            🔥
          </span>
          <div>
            <h2>{t('Visit streak')}</h2>
            <strong>
              {streak.error
                ? t('Unavailable')
                : streak.days === null
                  ? t('Loading…')
                  : t(
                      streak.days === 1 ? '{{value0}} day' : '{{value0}} days',
                      { value0: streak.days },
                    )}
            </strong>
            <p>
              {t(
                'Consecutive days visiting this website. Come back daily to keep your streak!',
              )}
            </p>
            {streak.error && (
              <div role="alert">
                <p>{t(streak.error)}</p>
                <button onClick={streak.retry}>{t('Retry streak')}</button>
              </div>
            )}
          </div>
        </section>
      )}
      <section className="dashboard-welcome" aria-labelledby="welcome-title">
        <div>
          <span className="welcome-tag">{t('A LITTLE BETTER EVERY DAY')}</span>
          <h2 id="welcome-title">
            <span>{t('Grow your vocabulary.')}</span>
            <br />
            {t('Open up your world.')}
          </h2>
          <p>
            {t('A new word today. A little more confidence tomorrow.')}
            <br />
            {t('Your next learning moment starts here.')}
          </p>
          {onNavigate && (
            <div className="welcome-actions">
              <button
                className="welcome-primary"
                onClick={() => onNavigate('vocabulary')}
              >
                {t('Explore vocabulary')} <span aria-hidden="true">↗</span>
              </button>
              <button onClick={() => onNavigate('flashcards')}>
                {t('Practice flashcards')} <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
          <div className="welcome-summary">
            <span className="welcome-number">
              {metrics ? metrics.total : '—'}
            </span>
            <div>
              <strong>{t('words in your collection')}</strong>
              <span>{t('Make room for a new word today.')}</span>
            </div>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-card-back">
            Aa<span>{t('vocabulary')}</span>
          </div>
          <div className="art-card art-card-front">
            Hello<span>{t('/həˈləʊ/')}</span>
            <i>{t('a small word, a new beginning')}</i>
          </div>
          <span className="art-spark">✦</span>
        </div>
      </section>
      {error ? (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            onClick={() => {
              setError('')
              setMetrics(null)
              setAttempt((value) => value + 1)
            }}
          >
            {t('Retry dashboard')}
          </button>
        </div>
      ) : !metrics ? (
        <p role="status">{t('Loading saved learning data…')}</p>
      ) : (
        <>
          {metrics.total === 0 && (
            <section className="dashboard-panel">
              <h2>{t('Start your vocabulary collection')}</h2>
              <p>
                {t(
                  'Add words or import an XLSX file in Vocabulary, then start a flashcard session or quiz. Your saved activity will appear here.',
                )}
              </p>
            </section>
          )}
          <div className="dashboard-overview">
            <section
              className="dashboard-stats"
              aria-labelledby="overview-title"
            >
              <div className="panel-heading">
                <h2 id="overview-title">{t('Your vocabulary at a glance')}</h2>
                <span>{t('Saved learning data')}</span>
              </div>
              <div className="dashboard-grid">
                <MetricCard
                  label={t('Total vocabulary')}
                  value={metrics.total}
                  detail={t(
                    'Current vocabulary entries, including separate meanings of the same word.',
                  )}
                />
                <MetricCard
                  label={t('New words')}
                  value={metrics.newWords}
                  detail={t(
                    'No review mark or submitted quiz answer in the saved sessions.',
                  )}
                />
                <MetricCard
                  label={t('Learning words')}
                  value={metrics.learning}
                  detail={t(
                    'Studied entries that do not meet the saved-session learned rule.',
                  )}
                />
                <MetricCard
                  label={t('Learned words')}
                  value={metrics.learned}
                  detail={t(
                    'Marked remembered in flashcards, with no incorrect answer in the saved quiz.',
                  )}
                />
                <MetricCard
                  label={t('Due for review today')}
                  value="Unavailable"
                  detail={t(
                    'The app does not yet persist an SRS schedule or review due dates.',
                  )}
                />
                <MetricCard
                  label={t('Quiz accuracy')}
                  value={
                    metrics.accuracy === null
                      ? 'No answers yet'
                      : `${metrics.accuracy.toFixed(1)}%`
                  }
                  detail={
                    metrics.quiz?.answered
                      ? t(
                          '{{value0}} correct of {{value1}} submitted answers in the saved quiz. Unanswered questions are excluded.',
                          {
                            value0: metrics.quiz.correct,
                            value1: metrics.quiz.answered,
                          },
                        )
                      : t('Answer a quiz question to see your accuracy.')
                  }
                />
              </div>
            </section>
            <section
              className="dashboard-panel"
              aria-labelledby="dashboard-progress-title"
            >
              <h2 id="dashboard-progress-title">
                {t('Current learning progress')}
              </h2>
              <p>
                {metrics.learned} {t('of')} {metrics.total}{' '}
                {t('current entries meet the learned rule.')}
              </p>
              <meter
                min={0}
                max={metrics.total || 1}
                value={metrics.learned}
                aria-label={t('Current entries meeting the learned rule')}
              />
              <p>
                {t(
                  'These categories use only retained sessions, not lifetime mastery or SRS status. A missed answer takes precedence when results conflict. Entries selected but not reviewed stay new. Starting a new session or restarting flashcards can change these counts.',
                )}
              </p>
            </section>
          </div>
          <section
            className="dashboard-panel"
            aria-labelledby="dashboard-activity-title"
          >
            <h2 id="dashboard-activity-title">{t('Recent study activity')}</h2>
            <p>
              {t(
                'Only the current saved flashcard session and quiz are retained. Study timestamps are not stored, so this activity cannot be dated or ordered by recency.',
              )}
            </p>
            {!metrics.flashcards && !metrics.quiz ? (
              <p>
                {t(
                  'No saved study sessions yet. Study some flashcards or start a quiz to begin.',
                )}
              </p>
            ) : (
              <ul className="dashboard-activity">
                {metrics.flashcards && (
                  <li>
                    <h3>{t('Saved flashcard session')}</h3>
                    <p>
                      {metrics.flashcards.remembered} {t('remembered ·')}{' '}
                      {metrics.flashcards.notRemembered} {t('not remembered ·')}{' '}
                      {metrics.flashcards.unreviewed} {t('unreviewed of')}{' '}
                      {metrics.flashcards.total} {t('cards.')}
                    </p>
                  </li>
                )}
                {metrics.quiz && (
                  <li>
                    <h3>
                      {t('Saved quiz ·')}{' '}
                      {metrics.quiz.finished
                        ? t('Completed')
                        : t('In progress')}
                    </h3>
                    <p>
                      {metrics.quiz.answered} {t('of')} {metrics.quiz.total}{' '}
                      {t('answered ·')} {metrics.quiz.correct} {t('correct ·')}{' '}
                      {metrics.quiz.answered - metrics.quiz.correct}{' '}
                      {t('missed.')}
                    </p>
                  </li>
                )}
              </ul>
            )}
            {(metrics.flashcards || metrics.quiz) && (
              <p>
                {t(
                  'Saved session totals include word snapshots removed from the library. Word categories above count only entries still in your library.',
                )}
              </p>
            )}
          </section>
          <section className="dashboard-panel">
            <h2>{t('Learning progress over time')}</h2>
            <p>
              {t(
                'Historical learning data is not available. The app does not store dated review events or previous quizzes, so a timeline cannot be calculated from the existing data.',
              )}
            </p>
          </section>
        </>
      )}
    </main>
  )
}
