import { liveQuery } from 'dexie'
import type { ApplicationDatabase } from '../../db/ApplicationDatabase'
import { IndexedDBReviewProgressRepository } from '../flashcards/progressRepository'
import { IndexedDBQuizProgressRepository } from '../quiz/progressRepository'
import type { DashboardSnapshot } from './metrics'

export interface DashboardRepository {
  subscribe(
    onSnapshot: (snapshot: DashboardSnapshot) => void,
    onError: (error: unknown) => void,
  ): () => void
}
export class IndexedDBDashboardRepository implements DashboardRepository {
  private readonly db: ApplicationDatabase
  constructor(db: ApplicationDatabase) {
    this.db = db
  }
  async load(): Promise<DashboardSnapshot> {
    try {
      return await this.db.transaction(
        'r',
        [this.db.vocabulary, this.db.flashcardSessions, this.db.quizSessions],
        async () => {
          // Only keys are needed: don't materialize every vocabulary text field.
          // Progress repositories validate saved session structure before use.
          const [vocabularyIds, flashcards, quiz] = await Promise.all([
            this.db.vocabulary.toCollection().primaryKeys(),
            new IndexedDBReviewProgressRepository(this.db).load(),
            new IndexedDBQuizProgressRepository(this.db).load(),
          ])
          return {
            vocabularyIds,
            flashcards: flashcards?.session ?? null,
            quiz: quiz?.session ?? null,
          }
        },
      )
    } catch (error) {
      throw new Error(
        'Could not read dashboard data. Check local storage permissions and saved study progress, then retry. No data was changed.',
        { cause: error },
      )
    }
  }
  subscribe(
    onSnapshot: (snapshot: DashboardSnapshot) => void,
    onError: (error: unknown) => void,
  ) {
    const subscription = liveQuery(() => this.load()).subscribe({
      next: onSnapshot,
      error: onError,
    })
    return () => subscription.unsubscribe()
  }
}
