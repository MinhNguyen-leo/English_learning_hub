import {
  ApplicationDatabase,
  StorageChangedError,
} from '../../db/ApplicationDatabase'
import Dexie, { type Table } from 'dexie'
import { isStudySession, type StudySession } from './session'

export interface SavedSession {
  id: 'active'
  revision: number
  session: StudySession
}
export interface ReviewProgressRepository {
  load(): Promise<SavedSession | null>
  save(
    session: StudySession,
    expectedRevision: number | null,
  ): Promise<SavedSession>
}
export class ReviewProgressDatabase extends Dexie {
  sessions!: Table<SavedSession, string>
  constructor(name = 'english-learning-hub-guest-flashcards') {
    super(name)
    this.version(1).stores({ sessions: 'id' })
  }
}
export class ProgressError extends Error {}
function validateSaved(value: unknown): asserts value is SavedSession {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    value.id !== 'active' ||
    !('revision' in value) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !('session' in value) ||
    !isStudySession(value.session)
  )
    throw new ProgressError(
      'Saved flashcard progress is invalid or from an unsupported version. No saved data was overwritten.',
    )
}
export class IndexedDBReviewProgressRepository implements ReviewProgressRepository {
  private readonly db: Dexie
  private readonly table: Table<SavedSession, string>
  private readonly generation: number | undefined
  constructor(
    db: ReviewProgressDatabase | ApplicationDatabase,
    generation?: number,
  ) {
    this.db = db
    this.table =
      db instanceof ApplicationDatabase ? db.flashcardSessions : db.sessions
    this.generation = generation
  }
  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof StorageChangedError) throw error
      if (error instanceof ProgressError) throw error
      throw new ProgressError(
        'Could not access local review storage. This action was not saved. Check browser storage permissions or space, then retry.',
        { cause: error },
      )
    }
  }
  load() {
    return this.storage(async () => {
      const saved = await this.table.get('active')
      if (!saved) return null
      validateSaved(saved)
      return saved
    })
  }
  save(session: StudySession, expectedRevision: number | null) {
    return this.storage(() =>
      this.db.transaction(
        'rw',
        this.db instanceof ApplicationDatabase
          ? [this.table, this.db.metadata]
          : [this.table],
        async () => {
          if (this.db instanceof ApplicationDatabase)
            await this.db.assertGeneration(this.generation)
          if (!isStudySession(session))
            throw new ProgressError('Cannot save an invalid flashcard session.')
          const current = await this.table.get('active')
          if (current) validateSaved(current)
          if ((current?.revision ?? null) !== expectedRevision)
            throw new ProgressError(
              'Flashcard progress changed in another tab. Reload saved progress before continuing. This action was not saved.',
            )
          const revision = (current?.revision ?? 0) + 1
          if (!Number.isSafeInteger(revision))
            throw new ProgressError('Review storage revision limit reached.')
          const saved: SavedSession = { id: 'active', revision, session }
          await this.table.put(saved)
          return saved
        },
      ),
    )
  }
}
