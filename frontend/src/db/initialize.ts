import Dexie from 'dexie'
import { ApplicationDatabase, defaultSettings } from './ApplicationDatabase'
import { ReviewProgressDatabase } from '../features/flashcards/progressRepository'
import { QuizProgressDatabase } from '../features/quiz/progressRepository'

// Legacy databases are retained as recovery copies, never cleared or deleted.
// The marker is committed with the copied records, making retries idempotent.
export async function initializeStorage(
  db: ApplicationDatabase,
  legacyNames = {
    flashcards: 'english-learning-hub-guest-flashcards',
    quiz: 'english-learning-hub-guest-quiz',
  },
) {
  if (await db.metadata.get('legacy-progress-imported')) return
  const flashcards = new ReviewProgressDatabase(legacyNames.flashcards)
  const quiz = new QuizProgressDatabase(legacyNames.quiz)
  try {
    const cards = (await Dexie.exists(flashcards.name))
      ? await flashcards.sessions.toArray()
      : []
    const quizzes = (await Dexie.exists(quiz.name))
      ? await quiz.sessions.toArray()
      : []
    await db.transaction(
      'rw',
      [db.flashcardSessions, db.quizSessions, db.settings, db.metadata],
      async () => {
        if (await db.metadata.get('legacy-progress-imported')) return
        for (const record of cards)
          if (!(await db.flashcardSessions.get(record.id)))
            await db.flashcardSessions.add(record)
        for (const record of quizzes)
          if (!(await db.quizSessions.get(record.id)))
            await db.quizSessions.add(record)
        if (!(await db.settings.get('preferences')))
          await db.settings.add(defaultSettings)
        await db.metadata.put({ id: 'legacy-progress-imported', value: 1 })
      },
    )
  } finally {
    flashcards.close()
    quiz.close()
  }
}
