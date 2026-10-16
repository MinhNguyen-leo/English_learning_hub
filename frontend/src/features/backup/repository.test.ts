import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApplicationDatabase } from '../../db/ApplicationDatabase'
import { IndexedDBVocabularyRepository } from '../vocabulary/repository'
import { IndexedDBReviewProgressRepository } from '../flashcards/progressRepository'
import { IndexedDBQuizProgressRepository } from '../quiz/progressRepository'
import { quizResults } from '../quiz/session'
import { fixture } from './testSupport'
import { createBackup, conflicts, parseBackup } from './model'
import { IndexedDBBackupRepository } from './repository'

let db: ApplicationDatabase
let repository: IndexedDBBackupRepository
beforeEach(() => {
  db = new ApplicationDatabase(`backup-test-${crypto.randomUUID()}`)
  repository = new IndexedDBBackupRepository(db)
})
afterEach(async () => {
  await db.delete()
})
async function seed(backup = fixture()) {
  await repository.restore(await repository.preview(backup), 'replace', true)
  return backup
}
describe('atomic IndexedDB full backup', () => {
  it('restores an exported file into a fresh database with exact user data', async () => {
    await seed()
    const exported = parseBackup(JSON.stringify(await repository.export()))
    const destination = new ApplicationDatabase(
      `backup-test-${crypto.randomUUID()}`,
    )
    try {
      const target = new IndexedDBBackupRepository(destination)
      await target.restore(await target.preview(exported), 'merge')
      expect((await target.export()).data).toEqual(exported.data)
      expect(
        await destination.metadata.get('legacy-progress-imported'),
      ).toEqual({ id: 'legacy-progress-imported', value: 1 })
    } finally {
      await destination.delete()
    }
  })
  it('exports, restores and compares every record after closing and reopening IndexedDB', async () => {
    const original = await seed()
    const exported = parseBackup(JSON.stringify(await repository.export()))
    expect(exported.data).toEqual(original.data)
    // Replace nonempty stores to prove this is not just an empty-store import.
    await new IndexedDBVocabularyRepository(db).create({
      ...original.data.vocabulary[0]!,
      word: 'unrelated',
    })
    await repository.restore(
      await repository.preview(exported),
      'replace',
      true,
    )
    db.close()
    db = new ApplicationDatabase(db.name)
    repository = new IndexedDBBackupRepository(db)
    expect((await repository.export()).data).toEqual(original.data)
    const quiz = await new IndexedDBQuizProgressRepository(db).load()
    const study = await new IndexedDBReviewProgressRepository(db).load()
    expect(quizResults(quiz!.session)).toEqual(
      quizResults(original.data.quizSessions[0]!.session),
    )
    expect(study).toEqual(original.data.flashcardSessions[0])
  })
  it('merges missing IDs, keeps all existing conflicts and is idempotent', async () => {
    const current = await seed()
    const incoming = fixture()
    incoming.data.vocabulary[0]!.note = 'incoming conflict'
    const duplicateMeaning = {
      ...incoming.data.vocabulary[0]!,
      id: crypto.randomUUID(),
    }
    incoming.data.vocabulary.push(duplicateMeaning)
    incoming.data.flashcardSessions[0]!.session.flipped = false
    incoming.data.quizSessions[0]!.session.answers[0] = null
    incoming.data.quizSessions[0]!.session.index = 0
    incoming.data.settings[0]!.quizSize = 20
    const preview = await repository.preview(incoming)
    expect(conflicts(incoming.data, preview.current)).toEqual({
      vocabulary: 1,
      flashcardSessions: 1,
      quizSessions: 1,
      settings: 1,
    })
    await repository.restore(preview, 'merge')
    const merged = (await repository.export()).data
    expect(
      merged.vocabulary.find(
        (word) => word.id === current.data.vocabulary[0]!.id,
      ),
    ).toEqual(current.data.vocabulary[0])
    expect(
      merged.vocabulary.find((word) => word.id === duplicateMeaning.id),
    ).toEqual(duplicateMeaning)
    expect(merged.flashcardSessions).toEqual(current.data.flashcardSessions)
    expect(merged.quizSessions).toEqual(current.data.quizSessions)
    expect(merged.settings).toEqual(current.data.settings)
    await repository.restore(await repository.preview(incoming), 'merge')
    expect((await repository.export()).data).toEqual(merged)
  })
  it('refuses Replace without explicit confirmation', async () => {
    const original = await seed()
    await expect(
      repository.restore(
        await repository.preview(
          createBackup({
            vocabulary: [],
            flashcardSessions: [],
            quizSessions: [],
            settings: [],
          }),
        ),
        'replace',
      ),
    ).rejects.toThrow('confirmation')
    expect((await repository.export()).data).toEqual(original.data)
  })
  it('validates again at commit and never clears data on invalid input', async () => {
    const original = await seed()
    const preview = await repository.preview(fixture())
    preview.backup.data.quizSessions[0]!.session.answers[0] = 7
    await expect(repository.restore(preview, 'replace', true)).rejects.toThrow(
      'Invalid backup',
    )
    expect((await repository.export()).data).toEqual(original.data)
  })
  it('rejects stale previews when another tab saves vocabulary, progress or settings', async () => {
    await seed()
    const preview = await repository.preview(fixture())
    const anotherTab = new ApplicationDatabase(db.name)
    try {
      await anotherTab.settings.put({
        id: 'preferences',
        flashcardSize: 20,
        quizSize: 20,
      })
      await expect(
        repository.restore(preview, 'replace', true),
      ).rejects.toThrow('changed since preview')
      expect((await db.settings.get('preferences'))?.quizSize).toBe(20)
    } finally {
      anotherTab.close()
    }
  })
  it.each(['merge', 'replace'] as const)(
    'rolls back every store and generation if a late write fails during %s',
    async (mode) => {
      const original = await seed()
      const generation = await db.generation()
      const incoming = fixture()
      incoming.data.vocabulary[0]!.note = 'would change'
      db.settings.hook('creating', () => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      await expect(
        repository.restore(await repository.preview(incoming), mode, true),
      ).rejects.toThrow('No restore changes were committed')
      expect((await repository.export()).data).toEqual(original.data)
      expect(await db.generation()).toBe(generation)
    },
  )
  it('fences stale vocabulary, Excel import and session writes even when restored revisions match', async () => {
    const original = await seed()
    const epoch = await db.generation()
    const words = new IndexedDBVocabularyRepository(db, epoch)
    const cards = new IndexedDBReviewProgressRepository(db, epoch)
    const quiz = new IndexedDBQuizProgressRepository(db, epoch)
    await repository.restore(
      await repository.preview(original),
      'replace',
      true,
    )
    const row = original.data.vocabulary[0]!
    await expect(
      words.create({ ...row, word: 'stale create' }),
    ).rejects.toThrow('Reload')
    await expect(
      words.update(row.id, { ...row, note: 'stale edit' }, row.updated_at),
    ).rejects.toThrow('Reload')
    await expect(words.delete(row.id, row.updated_at)).rejects.toThrow('Reload')
    await expect(
      words.importEntries([], 'skip', original.data.vocabulary),
    ).rejects.toThrow('Reload')
    await expect(
      cards.save(original.data.flashcardSessions[0]!.session, 9),
    ).rejects.toThrow('Reload')
    await expect(
      quiz.save(original.data.quizSessions[0]!.session, 4),
    ).rejects.toThrow('Reload')
    expect((await repository.export()).data).toEqual(original.data)
  })
  it('allows confirmed recovery from corrupt current records using a valid Replace backup', async () => {
    await db.vocabulary.put({ ...fixture().data.vocabulary[0]!, word: '' })
    const valid = fixture()
    await repository.restore(await repository.preview(valid), 'replace', true)
    expect((await repository.export()).data).toEqual(valid.data)
  })
})
