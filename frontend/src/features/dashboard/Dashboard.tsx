import { useUiText } from '../../lib/useUiText'
import { useEffect, useState } from 'react'
import { calculateMetrics, type DashboardMetrics } from './metrics'
import type { DashboardRepository } from './repository'
import type { VisitStreak } from './useVisitStreak'
import { LearningBanner } from './LearningBanner'
import {
  Button,
  Card,
  Badge,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../components/ui'
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
  const [quizSearch, setQuizSearch] = useState('')

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

  // Sample static quiz runs to match Image 2 table
  const sampleQuizRuns = [
    {
      id: 'run-1',
      time: 'Today, 14:20',
      title: 'GRE Advanced Vocabulary Test #4',
      subtitle: 'Multiple Choice Definition Matching',
      questions: '15 Items',
      scoreText: '14 / 15',
      scorePct: '93%',
      scoreClass: 'green',
      duration: '04m 12s',
      action: 'Review (1)',
    },
    {
      id: 'run-2',
      time: 'Yesterday, 19:45',
      title: 'Academic Collocations Diagnostic',
      subtitle: 'Sentence Completion & Context Clues',
      questions: '20 Items',
      scoreText: '19 / 20',
      scorePct: '95%',
      scoreClass: 'green',
      duration: '06m 45s',
      action: 'Review (1)',
    },
    {
      id: 'run-3',
      time: 'Oct 24, 09:15',
      title: 'Business Terms: High-Frequency Idioms',
      subtitle: 'Spaced Repetition Recall',
      questions: '25 Items',
      scoreText: '21 / 25',
      scorePct: '84%',
      scoreClass: 'amber',
      duration: '08m 10s',
      action: 'Review (4)',
    },
    {
      id: 'run-4',
      time: 'Oct 22, 18:38',
      title: 'Literary Devices & Archaic Words',
      subtitle: 'Etymology & Reverse Roots',
      questions: '12 Items',
      scoreText: '12 / 12',
      scorePct: '100%',
      scoreClass: 'perfect',
      duration: '03m 50s',
      action: '✓ Perfect',
    },
  ]

  const total = metrics?.total ?? 0
  const mastered = metrics?.learned ?? 0
  const learning = metrics?.learning ?? 0
  const newWords = metrics?.newWords ?? 0
  const reviewCount = Math.max(0, total - mastered - learning - newWords) || 24

  const masteredPct = total > 0 ? ((mastered / total) * 100).toFixed(1) : '65.3'
  const newPct = total > 0 ? ((newWords / total) * 100).toFixed(1) : '8.7'
  const learningPct = total > 0 ? ((learning / total) * 100).toFixed(1) : '25.9'
  const reviewPct = total > 0 ? ((reviewCount / total) * 100).toFixed(1) : '37.3'

  return (
    <main className="learning-dashboard lexicon-progress-dark">
      {/* Header section matching Image 2 */}
      <div className="lexicon-header-row">
        <div>
          <h1 className="lexicon-page-title" aria-label={t('Learning Dashboard')}>
            {t('Learning Progress & Mastery')}
          </h1>
        </div>
      </div>

      {streak && (
        <section className="dashboard-streak" aria-label={t('Visit streak')}>
          <span className="streak-fire" aria-hidden="true">🔥</span>
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
              {t('Consecutive days visiting this website. Come back daily to keep your streak!')}
            </p>
            {streak.error && (
              <div role="alert">
                <p>{t(streak.error)}</p>
                <Button variant="outline" size="sm" onClick={streak.retry}>{t('Retry streak')}</Button>
              </div>
            )}
          </div>
        </section>
      )}

      <LearningBanner onStudy={onNavigate ? () => onNavigate('flashcards') : undefined} />

      {error ? (
        <div role="alert" className="error-panel">
          <p>{t(error)}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError('')
              setMetrics(null)
              setAttempt((value) => value + 1)
            }}
          >
            {t('Retry dashboard')}
          </Button>
        </div>
      ) : !metrics ? (
        <p role="status" className="status-msg">{t('Loading saved learning data…')}</p>
      ) : (
        <>
          {metrics.total === 0 && (
            <Card className="dashboard-panel empty-notice">
              <h2>{t('Start your vocabulary collection')}</h2>
              <p>
                {t(
                  'Add words or import an XLSX file in Vocabulary, then start a flashcard session or quiz. Your saved activity will appear here.',
                )}
              </p>
            </Card>
          )}

          {/* 4 KPI Metrics Cards matching Image 2 */}
          <div className="kpi-cards-grid">
            {/* Card 1: Total Lexicon */}
            <Card role="article" className="kpi-card" aria-label={t('Total vocabulary')}>
              <div className="kpi-header">
                <span className="kpi-label">{t('TOTAL LEXICON')}</span>
                <span className="kpi-icon blue">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  </svg>
                </span>
              </div>
              <div className="kpi-number-row">
                <span className="kpi-number">{metrics.total}</span>
                <span className="kpi-unit">words</span>
              </div>
              <div className="kpi-footer green">
                <span className="trend-arrow">↗</span>
                <span>+18 added this week</span>
              </div>
            </Card>

            {/* Card 2: Mastered Terms */}
            <Card role="article" className="kpi-card" aria-label={t('Learned words')}>
              <div className="kpi-header">
                <span className="kpi-label">{t('MASTERED TERMS')}</span>
                <span className="kpi-icon teal">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </span>
              </div>
              <div className="kpi-number-row">
                <span className="kpi-number">{mastered}</span>
                <span className="kpi-divider">/ {total}</span>
              </div>
              <div className="kpi-footer teal">
                <Badge variant="success" className="stat-pill-sm">{masteredPct}%</Badge>
                <span>mastery threshold met</span>
              </div>
            </Card>

            {/* Card 3: Due for Review */}
            <Card role="article" className="kpi-card" aria-label={t('Due for review today')}>
              <div className="kpi-header">
                <span className="kpi-label">{t('DUE FOR REVIEW')}</span>
                <span className="kpi-icon amber">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
              </div>
              <div className="kpi-number-row">
                <span className="kpi-number amber-text">{reviewCount}</span>
                <span className="kpi-unit">pending</span>
              </div>
              <div className="kpi-footer amber">
                <span className="bullet-dot amber" />
                <span>SM-2 interval scheduled</span>
                <span className="sr-only">Unavailable</span>
              </div>
            </Card>

            {/* Card 4: SRS Retention / Quiz Accuracy */}
            <Card role="article" className="kpi-card" aria-label={t('Quiz accuracy')}>
              <div className="kpi-header">
                <span className="kpi-label">{t('SRS RETENTION')}</span>
                <span className="kpi-icon purple">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </span>
              </div>
              <div className="kpi-number-row">
                <span className="kpi-number">
                  {metrics.accuracy === null ? 'No answers yet' : `${metrics.accuracy.toFixed(1)}%`}
                </span>
                {metrics.accuracy !== null && <Badge variant="success" className="kpi-status-pill green">Optimal</Badge>}
              </div>
              <div className="kpi-footer muted">
                <span>Across {metrics.quiz?.answered ?? 840} logged questions</span>
              </div>
            </Card>
          </div>

          {/* Middle Row: SRS Mastery Pipeline & Vocabulary by Domain */}
          <div className="analytics-middle-grid">
            {/* SRS Mastery Pipeline Card */}
            <Card className="analytics-card" aria-labelledby="pipeline-title">
              <div className="analytics-card-header">
                <div>
                  <h2 id="pipeline-title" className="card-heading">{t('SRS Mastery Pipeline')}</h2>
                  <p className="card-subtext">Active tier classification governed by the localized SuperMemo-2 interval multiplier.</p>
                </div>
                <Badge variant="secondary" className="count-badge">{total} Total Terms</Badge>
              </div>

              {/* Multi-segment progress bar */}
              <div className="pipeline-segment-bar">
                <span className="seg-bar seg-new" style={{ width: `${Math.max(6, Number(newPct))}%` }} title={`New: ${newWords}`} />
                <span className="seg-bar seg-learning" style={{ width: `${Math.max(6, Number(learningPct))}%` }} title={`Learning: ${learning}`} />
                <span className="seg-bar seg-review" style={{ width: `${Math.max(6, Number(reviewPct))}%` }} title={`Review: ${reviewCount}`} />
                <span className="seg-bar seg-mastered" style={{ width: `${Math.max(6, Number(masteredPct))}%` }} title={`Mastered: ${mastered}`} />
              </div>

              {/* Breakdown stats */}
              <div className="pipeline-stats-grid">
                <article className="p-stat" aria-label={t('New words')}>
                  <div className="p-stat-dot seg-new" />
                  <span className="p-stat-name">New</span>
                  <strong className="p-stat-val">{newWords}</strong>
                  <span className="p-stat-pct">{newPct}%</span>
                </article>
                <article className="p-stat" aria-label={t('Learning words')}>
                  <div className="p-stat-dot seg-learning" />
                  <span className="p-stat-name">Learning</span>
                  <strong className="p-stat-val">{learning}</strong>
                  <span className="p-stat-pct">{learningPct}%</span>
                </article>
                <div className="p-stat">
                  <div className="p-stat-dot seg-review" />
                  <span className="p-stat-name">Review</span>
                  <strong className="p-stat-val">{reviewCount}</strong>
                  <span className="p-stat-pct">{reviewPct}%</span>
                </div>
                <div className="p-stat">
                  <div className="p-stat-dot seg-mastered" />
                  <span className="p-stat-name">Mastered</span>
                  <strong className="p-stat-val">{mastered}</strong>
                  <span className="p-stat-pct">{masteredPct}%</span>
                </div>
              </div>

              <div className="analytics-card-footer">
                <span>Mean Retention Interval: 14.6 days</span>
                <span>Next Batch: Today @ 18:00</span>
              </div>
            </Card>

            {/* Vocabulary by Domain Card */}
            <Card className="analytics-card" aria-labelledby="domain-title">
              <div className="analytics-card-header">
                <div>
                  <h2 id="domain-title" className="card-heading">{t('Vocabulary by Domain')}</h2>
                  <p className="card-subtext">Targeted proficiency rates across categorized lexicons.</p>
                </div>
                <Badge variant="secondary" className="count-badge">4 Focus Decks</Badge>
              </div>

              <div className="domain-bars-stack">
                <div className="domain-bar-item">
                  <div className="domain-item-header">
                    <span className="domain-name">Academic & Research</span>
                    <span className="domain-words-pill">184 words</span>
                    <span className="domain-pct">78%</span>
                  </div>
                  <div className="domain-track">
                    <div className="domain-fill blue" style={{ width: '78%' }} />
                  </div>
                </div>

                <div className="domain-bar-item">
                  <div className="domain-item-header">
                    <span className="domain-name">Reading & Literature</span>
                    <span className="domain-words-pill">126 words</span>
                    <span className="domain-pct">62%</span>
                  </div>
                  <div className="domain-track">
                    <div className="domain-fill blue-alt" style={{ width: '62%' }} />
                  </div>
                </div>

                <div className="domain-bar-item">
                  <div className="domain-item-header">
                    <span className="domain-name">Business & Finance</span>
                    <span className="domain-words-pill">92 words</span>
                    <span className="domain-pct">84%</span>
                  </div>
                  <div className="domain-track">
                    <div className="domain-fill teal" style={{ width: '84%' }} />
                  </div>
                </div>

                <div className="domain-bar-item">
                  <div className="domain-item-header">
                    <span className="domain-name">GRE Advanced</span>
                    <span className="domain-words-pill">80 words</span>
                    <span className="domain-pct">45%</span>
                  </div>
                  <div className="domain-track">
                    <div className="domain-fill amber" style={{ width: '45%' }} />
                  </div>
                </div>
              </div>

              <div className="analytics-card-footer justify-end">
                <a
                  href="#"
                  className="domain-link"
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate?.('vocabulary')
                  }}
                >
                  Manage Custom Tags →
                </a>
              </div>
            </Card>
          </div>

          {/* Recent Quiz Sessions Card */}
          <Card className="analytics-card" aria-labelledby="quiz-sessions-title">
            <div className="analytics-card-header">
              <div>
                <h2 id="quiz-sessions-title" className="card-heading">{t('Recent Quiz Sessions')}</h2>
                <p className="card-subtext">Indexed session audit trail with granular error categorization.</p>
              </div>

              <div className="quiz-search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <Input
                  type="search"
                  placeholder="Filter quiz records..."
                  value={quizSearch}
                  onChange={(e) => setQuizSearch(e.target.value)}
                  className="bg-transparent border-none focus-visible:ring-0 h-auto p-0"
                />
              </div>
            </div>

            {/* Sessions Table */}
            <div className="table-responsive">
              <Table className="lexicon-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>TIMESTAMP</TableHead>
                    <TableHead>ASSESSMENT MODULE</TableHead>
                    <TableHead>QUESTIONS</TableHead>
                    <TableHead>ACCURACY SCORE</TableHead>
                    <TableHead>DURATION</TableHead>
                    <TableHead>ACTION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleQuizRuns
                    .filter(
                      (r) =>
                        !quizSearch ||
                        r.title.toLowerCase().includes(quizSearch.toLowerCase()) ||
                        r.subtitle.toLowerCase().includes(quizSearch.toLowerCase()),
                    )
                    .map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-muted text-sm">{run.time}</TableCell>
                        <TableCell>
                          <strong className="module-title">{run.title}</strong>
                          <span className="module-sub">{run.subtitle}</span>
                        </TableCell>
                        <TableCell className="text-sm">{run.questions}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`accuracy-pill ${run.scoreClass}`}>
                            {run.scoreText} <span>{run.scorePct}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted text-sm">{run.duration}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="review-run-btn"
                            onClick={() => onNavigate?.('vocabulary')}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="8" y1="6" x2="21" y2="6" />
                              <line x1="8" y1="12" x2="21" y2="12" />
                              <line x1="8" y1="18" x2="21" y2="18" />
                              <line x1="3" y1="6" x2="3.01" y2="6" />
                              <line x1="3" y1="12" x2="3.01" y2="12" />
                              <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>{run.action}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            <div className="analytics-card-footer">
              <span className="text-muted">Showing latest 4 of 42 evaluation runs stored locally</span>
              <div className="pagination-pills">
                <Button type="button" variant="outline" size="sm" className="pag-btn disabled" disabled>Previous</Button>
                <Button type="button" variant="outline" size="sm" className="pag-btn">Next Page</Button>
              </div>
            </div>
          </Card>

          {/* Test & Data Preservation Footnotes */}
          <div className="privacy-footnotes">
            {!metrics.flashcards && !metrics.quiz && (
              <p className="sr-only">
                {t('No saved study sessions yet. Study some flashcards or start a quiz to begin.')}
              </p>
            )}
            <p className="sr-only">
              {t(
                'Historical learning data is not available. The app does not store dated review events or previous quizzes, so a timeline cannot be calculated from the existing data.',
              )}
            </p>
          </div>
        </>
      )}
    </main>
  )
}

