import {
  ApplicationDatabase as VocabularyDatabase,
  StorageChangedError,
} from '../../db/ApplicationDatabase'
export { ApplicationDatabase as VocabularyDatabase } from '../../db/ApplicationDatabase'
import {
  validate,
  duplicateKey,
  VocabularyError,
  type Vocabulary,
  type VocabularyInput,
} from './model'
import { planImport, snapshotKey, type DuplicatePolicy } from './importPlan'

export interface VocabularyRepository {
  list(): Promise<Vocabulary[]>
  create(input: VocabularyInput): Promise<Vocabulary>
  update(
    id: string,
    input: VocabularyInput,
    expectedUpdatedAt: string,
  ): Promise<Vocabulary>
  delete(id: string, expectedUpdatedAt: string): Promise<void>
  importEntries(
    inputs: VocabularyInput[],
    policy: DuplicatePolicy,
    snapshot: Vocabulary[],
  ): Promise<Vocabulary[]>
}
export class IndexedDBVocabularyRepository implements VocabularyRepository {
  private readonly db: VocabularyDatabase
  private readonly generation: number | undefined
  constructor(db: VocabularyDatabase, generation?: number) {
    this.db = db
    this.generation = generation
  }
  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof StorageChangedError) throw error
      if (error instanceof VocabularyError) throw error
      throw new VocabularyError(
        'Browser storage failed. Your changes were not confirmed. Keep your draft and retry. Check available space and browser storage permissions.',
        { cause: error },
      )
    }
  }
  list() {
    return this.storage(() => this.db.vocabulary.toArray())
  }
  private async current(id: string, expected: string) {
    const row = await this.db.vocabulary.get(id)
    if (!row || row.updated_at !== expected)
      throw new VocabularyError(
        'This entry changed or was deleted in another tab. Your draft is preserved. Copy it before cancelling and reloading the latest entries.',
      )
    return row
  }
  async create(input: VocabularyInput) {
    const value = validate(input)
    return this.storage(() =>
      this.db.transaction(
        'rw',
        [this.db.vocabulary, this.db.metadata],
        async () => {
          await this.db.assertGeneration(this.generation)
          await this.checkDuplicate(value)
          const now = new Date().toISOString()
          const row = {
            ...value,
            id: crypto.randomUUID(),
            created_at: now,
            updated_at: now,
          }
          await this.db.vocabulary.add(row)
          return row
        },
      ),
    )
  }
  async update(id: string, input: VocabularyInput, expectedUpdatedAt: string) {
    const value = validate(input)
    return this.storage(() =>
      this.db.transaction(
        'rw',
        [this.db.vocabulary, this.db.metadata],
        async () => {
          await this.db.assertGeneration(this.generation)
          const current = await this.current(id, expectedUpdatedAt)
          if (duplicateKey(current) !== duplicateKey(value))
            await this.checkDuplicate(value, id)
          const row = {
            ...current,
            ...value,
            updated_at: new Date(
              Math.max(Date.now(), Date.parse(current.updated_at) + 1),
            ).toISOString(),
          }
          await this.db.vocabulary.put(row)
          return row
        },
      ),
    )
  }
  delete(id: string, expectedUpdatedAt: string) {
    return this.storage(() =>
      this.db.transaction(
        'rw',
        [this.db.vocabulary, this.db.metadata],
        async () => {
          await this.db.assertGeneration(this.generation)
          await this.current(id, expectedUpdatedAt)
          await this.db.vocabulary.delete(id)
        },
      ),
    )
  }
  private async checkDuplicate(input: VocabularyInput, exceptId?: string) {
    const duplicate = await this.db.vocabulary
      .filter(
        (row) =>
          row.id !== exceptId && duplicateKey(row) === duplicateKey(input),
      )
      .first()
    if (duplicate)
      throw new VocabularyError(
        'This word with these meanings already exists. Use a different meaning for another entry.',
      )
  }
  importEntries(
    inputs: VocabularyInput[],
    policy: DuplicatePolicy,
    snapshot: Vocabulary[],
  ) {
    return this.storage(() =>
      this.db.transaction(
        'rw',
        [this.db.vocabulary, this.db.metadata],
        async () => {
          await this.db.assertGeneration(this.generation)
          const current = await this.db.vocabulary.toArray()
          if (snapshotKey(current) !== snapshotKey(snapshot))
            throw new VocabularyError(
              'Your library changed since preview. Refresh the preview before importing. Nothing was imported.',
            )
          const plan = planImport(inputs, current, policy)
          for (const { original, input } of plan.writes) {
            const now = new Date(
              Math.max(
                Date.now(),
                original ? Date.parse(original.updated_at) + 1 : 0,
              ),
            ).toISOString()
            await this.db.vocabulary.put({
              ...input,
              id: original?.id ?? crypto.randomUUID(),
              created_at: original?.created_at ?? now,
              updated_at: now,
            })
          }
          return this.db.vocabulary.toArray()
        },
      ),
    )
  }
}
