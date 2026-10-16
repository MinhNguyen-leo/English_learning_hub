import { defaultSettings } from '../../db/ApplicationDatabase'
import { createSession, transition } from '../flashcards/session'
import { createQuizSession, quizTransition } from '../quiz/session'
import { generateQuiz } from '../quiz/generator'
import { vocabulary, seededRandom } from '../quiz/testSupport'
import { createBackup } from './model'

export function fixture() {
  const words = vocabulary(6).map((word, i) => ({
    ...word,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    vietnamese_meaning: `giáo dục mầm non — Tiếng Việt${i ? ` ${i}` : ''}`,
    note: '<script>alert("text only")</script>',
  }))
  const study = createSession(words, 'all', seededRandom(5))
  const session = transition(
    transition(study, { type: 'review', status: 'remembered' }),
    { type: 'flip' },
  )
  let quiz = createQuizSession(generateQuiz(words, 10, seededRandom(42)), 10)
  quiz = quizTransition(quiz, {
    type: 'submit',
    choice: (quiz.questions[0]!.correctIndex + 1) % 4,
  })
  quiz = quizTransition(quiz, { type: 'next' })
  return createBackup({
    // Snapshots intentionally retain the sixth word after it leaves the library.
    vocabulary: words.slice(0, 5),
    flashcardSessions: [{ id: 'active', revision: 9, session }],
    quizSessions: [{ id: 'active', revision: 4, session: quiz }],
    settings: [{ ...defaultSettings, flashcardSize: 'all', quizSize: 50 }],
  })
}
