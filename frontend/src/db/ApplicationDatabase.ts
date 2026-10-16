import Dexie, { type Table } from 'dexie'
import type { Vocabulary } from '../features/vocabulary/model'
import type { SavedSession } from '../features/flashcards/progressRepository'
import type { SavedQuiz } from '../features/quiz/progressRepository'

export interface AppSettings {
  id: 'preferences'
  flashcardSize: 20 | 50 | 'all'
  quizSize: 10 | 20 | 50 | 'all'
}
export const defaultSettings: AppSettings = {
  id: 'preferences',
  flashcardSize: 20,
  quizSize: 10,
}
export class StorageChangedError extends Error {}

// An additive upgrade: the original vocabulary table and every ID stay intact.
// All authoritative application stores now share one native IDB transaction.
export class ApplicationDatabase extends Dexie {
  vocabulary!: Table<Vocabulary, string>
  flashcardSessions!: Table<SavedSession, string>
  quizSessions!: Table<SavedQuiz, string>
  settings!: Table<AppSettings, string>
  metadata!: Table<{ id: string; value: number }, string>
  constructor(name = 'english-learning-hub-guest') {
    super(name)
    this.version(1).stores({
      vocabulary: 'id, word, part_of_speech, updated_at',
    })
    this.version(2).stores({
      vocabulary: 'id, word, part_of_speech, updated_at',
      flashcardSessions: 'id',
      quizSessions: 'id',
      settings: 'id',
      metadata: 'id',
    })
  }
  async generation() {
    return (await this.metadata.get('generation'))?.value ?? 0
  }
  async assertGeneration(expected: number | undefined) {
    if (expected !== undefined && (await this.generation()) !== expected)
      throw new StorageChangedError(
        'Local data was restored in this or another tab. Reload the page before saving. Your action was not saved.',
      )
  }
}
