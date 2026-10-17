import { useUiText } from '../lib/useUiText'
import { useEffect, useState } from 'react'
import { VocabularyManager } from '../features/vocabulary/VocabularyManager'
import { Flashcards } from '../features/flashcards/Flashcards'
import { Quiz } from '../features/quiz/Quiz'
import { DataManagement } from '../features/backup/DataManagement'
import { IndexedDBBackupRepository } from '../features/backup/repository'
import { IndexedDBQuizProgressRepository } from '../features/quiz/progressRepository'
import { IndexedDBReviewProgressRepository } from '../features/flashcards/progressRepository'
import { IndexedDBVocabularyRepository } from '../features/vocabulary/repository'
import {
  ApplicationDatabase,
  defaultSettings,
  type AppSettings,
} from '../db/ApplicationDatabase'
import { initializeStorage } from '../db/initialize'
import { Dashboard } from '../features/dashboard/Dashboard'
import { IndexedDBDashboardRepository } from '../features/dashboard/repository'
import { IndexedDBStreakRepository } from '../features/dashboard/streakRepository'
import { useVisitStreak } from '../features/dashboard/useVisitStreak'
import { Tutorial } from '../features/tutorial/Tutorial'
import { LanguageSwitch } from '../features/language/LanguageSwitch'
import { DonationQr } from '../features/donation/DonationQr'
import './app.css'
import './academy-theme.css'

const db = new ApplicationDatabase()
const backup = new IndexedDBBackupRepository(db)
const dashboard = new IndexedDBDashboardRepository(db)
const streakRepository = new IndexedDBStreakRepository(db)
async function loadRuntime() {
  await initializeStorage(db)
  return db.transaction('r', [db.metadata, db.settings], async () => {
    const generation = await db.generation()
    return {
      generation,
      settings: (await db.settings.get('preferences')) ?? defaultSettings,
      repository: new IndexedDBVocabularyRepository(db, generation),
      progress: new IndexedDBReviewProgressRepository(db, generation),
      quizProgress: new IndexedDBQuizProgressRepository(db, generation),
    }
  })
}
type Runtime = Awaited<ReturnType<typeof loadRuntime>>
export default function App() {
  const t = useUiText()

  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    loadRuntime()
      .then((value) => {
        if (active) setRuntime(value)
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to open local storage.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  if (!runtime)
    return (
      <main className="data-management">
        {error ? (
          <>
            <p role="alert">
              {t('Local storage could not be opened:')} {t(error)}
              {t(
                '. Existing data was retained. Close other tabs and reload to retry.',
              )}
            </p>
            <button onClick={() => window.location.reload()}>
              {t('Reload')}
            </button>
          </>
        ) : (
          <p role="status">
            {t('Opening local vocabulary and study progress…')}
          </p>
        )}
      </main>
    )
  return (
    <LearningHub
      runtime={runtime}
      onRestored={async () => setRuntime(await loadRuntime())}
    />
  )
}
function LearningHub({
  runtime,
  onRestored,
}: {
  runtime: Runtime
  onRestored: () => Promise<void>
}) {
  const t = useUiText()

  const { repository, progress, quizProgress } = runtime
  const streak = useVisitStreak(streakRepository)
  const [view, setView] = useState<
    'vocabulary' | 'flashcards' | 'quiz' | 'data' | 'dashboard'
  >('dashboard')
  const [studyOpened, setStudyOpened] = useState(false)
  const [quizOpened, setQuizOpened] = useState(false)
  const [dataOpened, setDataOpened] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  function savePreference(
    patch: Partial<Pick<AppSettings, 'flashcardSize' | 'quizSize'>>,
  ) {
    void db
      .transaction('rw', [db.settings, db.metadata], async () => {
        await db.assertGeneration(runtime.generation)
        const current =
          (await db.settings.get('preferences')) ?? defaultSettings
        await db.settings.put({ ...current, ...patch })
      })
      .then(() => setSettingsError(''))
      .catch(() =>
        setSettingsError(
          'Study preference was not saved. Reload if data was restored in another tab; check storage permissions and free space.',
        ),
      )
  }
  return (
    <div className="app-shell">
      <header className="app-sidebar">
        <a
          className="app-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setView('dashboard')
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <svg
              width="25"
              height="25"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v15M3 4h4a7 7 0 0 1 5 2 7 7 0 0 1 5-2h4v14h-4a7 7 0 0 0-5 2 7 7 0 0 0-5-2H3Z" />
            </svg>
          </span>
          <span>
            English Hub<small>{t('YOUR LEARNING SPACE')}</small>
          </span>
        </a>
        <nav className="app-navigation" aria-label={t('Learning features')}>
          <button
            aria-pressed={view === 'dashboard'}
            onClick={() => setView('dashboard')}
          >
            <span className="nav-icon" aria-hidden="true">
              ⌂
            </span>
            {t('Dashboard')}
          </button>
          <button
            aria-pressed={view === 'vocabulary'}
            onClick={() => setView('vocabulary')}
          >
            <span className="nav-icon" aria-hidden="true">
              ▤
            </span>
            {t('Vocabulary')}
          </button>
          <button
            aria-pressed={view === 'flashcards'}
            onClick={() => {
              setStudyOpened(true)
              setView('flashcards')
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ▱
            </span>
            {t('Flashcards')}
          </button>
          <button
            aria-pressed={view === 'quiz'}
            onClick={() => {
              setQuizOpened(true)
              setView('quiz')
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ✓
            </span>
            {t('Quiz')}
          </button>
          <button
            aria-pressed={view === 'data'}
            onClick={() => {
              setDataOpened(true)
              setView('data')
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ⇅
            </span>
            {t('Data Management')}
          </button>
        </nav>
        <div className="header-tools">
          <LanguageSwitch />
          <button
            className="tutorial-trigger"
            onClick={() => setTutorialOpen(true)}
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">▱</span>
            {t('Tutorial')}
          </button>
        </div>
      </header>
      {tutorialOpen && <Tutorial onClose={() => setTutorialOpen(false)} />}
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="workspace-title">
            <span className="topbar-label">{t('Your workspace')}</span>
            <strong>
              {view === 'data'
                ? t('Data Management')
                : t(view.charAt(0).toUpperCase() + view.slice(1))}
            </strong>
          </div>
          <svg
            className="contact-graffiti"
            viewBox="0 0 300 90"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 62c44-54 88 28 126-15s60-8 92-24M20 73c56-41 83 21 123-14s62-9 88-26"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="m244 14 5 12 13 1-10 9 3 13-12-7-11 7 2-13-10-9 14-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="m273 57 12 12m0-12-12 12M59 9v14m-7-7h14"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="170" cy="77" r="4" fill="currentColor" />
          </svg>
          <div className="contact-panels">
            <section
              className="workspace-profile"
              aria-labelledby="feedback-title"
            >
              <div className="local-badge">
                <span className="contact-feedback" id="feedback-title">
                  {t('Feedback to me at ins')}
                </span>
              </div>
              <a
                className="profile-avatar"
                href="https://www.instagram.com/t_minleo/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Instagram t_minleo (opens in a new tab)')}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle
                    cx="17.5"
                    cy="6.5"
                    r="1"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </a>
            </section>
            <section
              className="workspace-profile support-panel"
              aria-labelledby="support-title"
            >
              <div className="local-badge">
                <span className="contact-feedback" id="support-title">
                  {t('Support my work')}
                </span>
                <DonationQr compact />
              </div>
            </section>
          </div>
        </header>
        {settingsError && <p role="alert">{t(settingsError)}</p>}
        {view === 'dashboard' && (
          <Dashboard
            repository={dashboard}
            streak={streak}
            onNavigate={(destination) => {
              if (destination === 'flashcards') setStudyOpened(true)
              setView(destination)
            }}
          />
        )}
        <div
          key={`vocabulary-${runtime.generation}`}
          hidden={view !== 'vocabulary'}
        >
          <VocabularyManager repository={repository} />
        </div>
        {studyOpened && (
          <div
            key={`flashcards-${runtime.generation}`}
            hidden={view !== 'flashcards'}
          >
            <Flashcards
              repository={repository}
              progress={progress}
              initialSize={runtime.settings.flashcardSize}
              onSizeChange={(size) => savePreference({ flashcardSize: size })}
            />
          </div>
        )}
        {quizOpened && (
          <div key={`quiz-${runtime.generation}`} hidden={view !== 'quiz'}>
            <Quiz
              repository={repository}
              progress={quizProgress}
              active={view === 'quiz'}
              initialSize={runtime.settings.quizSize}
              onSizeChange={(size) => savePreference({ quizSize: size })}
            />
          </div>
        )}
        {dataOpened && (
          <div hidden={view !== 'data'}>
            <DataManagement
              repository={backup}
              onRestored={onRestored}
              active={view === 'data'}
            />
          </div>
        )}
        <footer className="app-footer">
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault()
              setView('dashboard')
            }}
          >
            English Hub<span aria-hidden="true">.</span>
          </a>
          <p>
            {t(
              'A little practice, every day. Your words. Your pace. Your progress.',
            )}
          </p>
          <span>{t('Made for curious minds.')}</span>
        </footer>
      </div>
    </div>
  )
}
