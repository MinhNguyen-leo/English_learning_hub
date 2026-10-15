import Dexie, { type Table } from 'dexie'
import { isQuizSession, type QuizSession } from './session'

export interface SavedQuiz {
  id: 'active'
  revision: number
  session: QuizSession
}
export interface QuizProgressRepository {
  load(): Promise<SavedQuiz | null>
  save(
    session: QuizSession,
    expectedRevision: number | null,
  ): Promise<SavedQuiz>
}
export class QuizProgressDatabase extends Dexie {
  sessions!: Table<SavedQuiz, string>
  constructor(name = 'english-learning-hub-guest-quiz') {
    super(name)
    this.version(1).stores({ sessions: 'id' })
  }
}
export class QuizProgressError extends Error {}
function assertSaved(value: unknown): asserts value is SavedQuiz {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    value.id !== 'active' ||
    !('revision' in value) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !('session' in value) ||
    !isQuizSession(value.session)
  )
    throw new QuizProgressError(
      'Saved quiz progress is invalid or unsupported. Nothing was overwritten.',
    )
}
export class IndexedDBQuizProgressRepository implements QuizProgressRepository {
  private readonly db: QuizProgressDatabase
  constructor(db: QuizProgressDatabase) {
    this.db = db
  }
  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof QuizProgressError) throw error
      throw new QuizProgressError(
        'Quiz storage failed. This action was not saved. Check browser permissions or available space and retry.',
        { cause: error },
      )
    }
  }
  load() {
    return this.storage(async () => {
      const saved = await this.db.sessions.get('active')
      if (!saved) return null
      assertSaved(saved)
      return saved
    })
  }
  save(session: QuizSession, expectedRevision: number | null) {
    return this.storage(() =>
      this.db.transaction('rw', this.db.sessions, async () => {
        if (!isQuizSession(session))
          throw new QuizProgressError('Cannot save an invalid quiz session.')
        const current = await this.db.sessions.get('active')
        if (current) assertSaved(current)
        if ((current?.revision ?? null) !== expectedRevision)
          throw new QuizProgressError(
            'Quiz progress changed in another tab. Reload saved quiz before continuing. This action was not saved.',
          )
        const revision = (current?.revision ?? 0) + 1
        if (!Number.isSafeInteger(revision))
          throw new QuizProgressError('Quiz revision limit reached.')
        const saved: SavedQuiz = { id: 'active', revision, session }
        await this.db.sessions.put(saved)
        return saved
      }),
    )
  }
}
