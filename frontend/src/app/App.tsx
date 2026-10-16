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
import './app.css'

const db = new ApplicationDatabase()
const backup = new IndexedDBBackupRepository(db)
const dashboard = new IndexedDBDashboardRepository(db)
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
              Local storage could not be opened: {error}. Existing data was
              retained. Close other tabs and reload to retry.
            </p>
            <button onClick={() => window.location.reload()}>Reload</button>
          </>
        ) : (
          <p role="status">Opening local vocabulary and study progress…</p>
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
  const { repository, progress, quizProgress } = runtime
  const [view, setView] = useState<
    'vocabulary' | 'flashcards' | 'quiz' | 'data' | 'dashboard'
  >('dashboard')
  const [studyOpened, setStudyOpened] = useState(false)
  const [quizOpened, setQuizOpened] = useState(false)
  const [dataOpened, setDataOpened] = useState(false)
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
      <aside className="app-sidebar">
        <a
          className="app-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setView('dashboard')
          }}
        >
          <span className="brand-mark">Eh</span>
          <span>
            English Hub<small>YOUR LEARNING SPACE</small>
          </span>
        </a>
        <nav className="app-navigation" aria-label="Learning features">
          <button
            aria-pressed={view === 'dashboard'}
            onClick={() => setView('dashboard')}
          >
            <span className="nav-icon" aria-hidden="true">
              ⌂
            </span>
            Dashboard
          </button>
          <button
            aria-pressed={view === 'vocabulary'}
            onClick={() => setView('vocabulary')}
          >
            <span className="nav-icon" aria-hidden="true">
              ▤
            </span>
            Vocabulary
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
            Flashcards
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
            Quiz
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
            Data Management
          </button>
        </nav>
        <div className="sidebar-note">
          <strong>A little practice, every day.</strong>
          <p>Your words. Your pace. Your progress.</p>
          <span>● Saved on this device</span>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div>
            <span className="topbar-label">Your workspace</span>
            <strong>
              {view === 'data'
                ? 'Data Management'
                : view.charAt(0).toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="workspace-profile">
            <span className="local-badge">Local learning</span>
            <span className="profile-avatar" aria-label="Guest learner">
              EL
            </span>
          </div>
        </header>
        {settingsError && <p role="alert">{settingsError}</p>}
        {view === 'dashboard' && <Dashboard repository={dashboard} />}
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
      </div>
    </div>
  )
}
