import {
  ApplicationDatabase,
  StorageChangedError,
} from '../../db/ApplicationDatabase'
import {
  BackupError,
  createBackup,
  validateBackup,
  validateData,
  mergeData,
  type FullBackup,
  type BackupData,
  type RestoreMode,
} from './model'

export interface RestorePreview {
  backup: FullBackup
  current: BackupData
  generation: number
}
export interface BackupRepository {
  export(): Promise<FullBackup>
  preview(backup: FullBackup): Promise<RestorePreview>
  restore(
    preview: RestorePreview,
    mode: RestoreMode,
    replaceConfirmed?: boolean,
  ): Promise<void>
}
export class IndexedDBBackupRepository implements BackupRepository {
  private readonly db: ApplicationDatabase
  constructor(db: ApplicationDatabase) {
    this.db = db
  }
  private get tables() {
    return [
      this.db.vocabulary,
      this.db.flashcardSessions,
      this.db.quizSessions,
      this.db.settings,
      this.db.metadata,
    ]
  }
  private async snapshot(): Promise<BackupData> {
    const [vocabulary, flashcardSessions, quizSessions, settings] =
      await Promise.all([
        this.db.vocabulary.toArray(),
        this.db.flashcardSessions.toArray(),
        this.db.quizSessions.toArray(),
        this.db.settings.toArray(),
      ])
    return { vocabulary, flashcardSessions, quizSessions, settings }
  }
  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof BackupError || error instanceof StorageChangedError)
        throw error
      throw new BackupError(
        'Local backup storage failed. No restore changes were committed. Check browser storage permissions and free space, then retry.',
        { cause: error },
      )
    }
  }
  export() {
    return this.storage(() =>
      this.db.transaction('r', this.tables, async () =>
        createBackup(await this.snapshot()),
      ),
    )
  }
  preview(backup: FullBackup) {
    return this.storage(async () => {
      // Clone validated input: changes to the caller's object cannot change a preview.
      validateBackup(backup)
      const copy = createBackup(backup.data)
      copy.exportedAt = backup.exportedAt
      return this.db.transaction('r', this.tables, async () => ({
        backup: copy,
        current: await this.snapshot(),
        generation: await this.db.generation(),
      }))
    })
  }
  restore(
    preview: RestorePreview,
    mode: RestoreMode,
    replaceConfirmed = false,
  ) {
    return this.storage(async () => {
      if (mode !== 'merge' && mode !== 'replace')
        throw new BackupError('Choose Merge or Replace.')
      if (mode === 'replace' && !replaceConfirmed)
        throw new BackupError(
          'Explicit confirmation is required to replace all local data.',
        )
      validateBackup(preview.backup)
      const incoming = createBackup(preview.backup.data).data
      await this.db.transaction('rw', this.tables, async () => {
        const current = await this.snapshot()
        if (
          (await this.db.generation()) !== preview.generation ||
          JSON.stringify(current) !== JSON.stringify(preview.current)
        )
          throw new BackupError(
            'Local data changed since preview. Preview this backup again before restoring. Nothing was restored.',
          )
        const next = mode === 'merge' ? mergeData(current, incoming) : incoming
        validateData(next)
        const generation = (await this.db.generation()) + 1
        if (!Number.isSafeInteger(generation))
          throw new BackupError('Local storage generation limit reached.')
        // Every clear and write shares this native transaction. Quota errors,
        // hook failures, tab closure or crashes abort all stores together.
        for (const table of [
          this.db.vocabulary,
          this.db.flashcardSessions,
          this.db.quizSessions,
          this.db.settings,
        ])
          await table.clear()
        await this.db.vocabulary.bulkPut(next.vocabulary)
        await this.db.flashcardSessions.bulkPut(next.flashcardSessions)
        await this.db.quizSessions.bulkPut(next.quizSessions)
        await this.db.settings.bulkPut(next.settings)
        await this.db.metadata.put({ id: 'legacy-progress-imported', value: 1 })
        await this.db.metadata.put({ id: 'sample-vocabulary-initialized', value: 2 })
        await this.db.metadata.put({ id: 'generation', value: generation })
      })
    })
  }
}
