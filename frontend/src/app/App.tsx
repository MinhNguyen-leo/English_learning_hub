import { useState } from 'react'
import { VocabularyManager } from '../features/vocabulary/VocabularyManager'
import { Flashcards } from '../features/flashcards/Flashcards'
import { Quiz } from '../features/quiz/Quiz'
import {
  IndexedDBQuizProgressRepository,
  QuizProgressDatabase,
} from '../features/quiz/progressRepository'
import {
  IndexedDBReviewProgressRepository,
  ReviewProgressDatabase,
} from '../features/flashcards/progressRepository'
import {
  IndexedDBVocabularyRepository,
  VocabularyDatabase,
} from '../features/vocabulary/repository'
const repository = new IndexedDBVocabularyRepository(new VocabularyDatabase())
const progress = new IndexedDBReviewProgressRepository(
  new ReviewProgressDatabase(),
)
const quizProgress = new IndexedDBQuizProgressRepository(
  new QuizProgressDatabase(),
)
export default function App() {
  const [view, setView] = useState<'vocabulary' | 'flashcards' | 'quiz'>(
    'vocabulary',
  )
  const [studyOpened, setStudyOpened] = useState(false)
  const [quizOpened, setQuizOpened] = useState(false)
  return (
    <>
      <nav className="app-navigation" aria-label="Learning features">
        <button
          aria-pressed={view === 'vocabulary'}
          onClick={() => setView('vocabulary')}
        >
          Vocabulary
        </button>
        <button
          aria-pressed={view === 'flashcards'}
          onClick={() => {
            setStudyOpened(true)
            setView('flashcards')
          }}
        >
          Flashcards
        </button>
        <button
          aria-pressed={view === 'quiz'}
          onClick={() => {
            setQuizOpened(true)
            setView('quiz')
          }}
        >
          Quiz
        </button>
      </nav>
      <div hidden={view !== 'vocabulary'}>
        <VocabularyManager repository={repository} />
      </div>
      {studyOpened && (
        <div hidden={view !== 'flashcards'}>
          <Flashcards repository={repository} progress={progress} />
        </div>
      )}
      {quizOpened && (
        <div hidden={view !== 'quiz'}>
          <Quiz
            repository={repository}
            progress={quizProgress}
            active={view === 'quiz'}
          />
        </div>
      )}
    </>
  )
}
