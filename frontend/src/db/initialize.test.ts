import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ApplicationDatabase } from './ApplicationDatabase'
import { initializeStorage } from './initialize'
import { ReviewProgressDatabase } from '../features/flashcards/progressRepository'
import { QuizProgressDatabase } from '../features/quiz/progressRepository'
import { fixture } from '../features/backup/testSupport'
import { IndexedDBBackupRepository } from '../features/backup/repository'
import { IndexedDBVocabularyRepository } from '../features/vocabulary/repository'
import { fieldNames, validate } from '../features/vocabulary/model'

let db: ApplicationDatabase
let cards: ReviewProgressDatabase
let quiz: QuizProgressDatabase
beforeEach(() => {
  db = new ApplicationDatabase(`migration-test-${crypto.randomUUID()}`)
  cards = new ReviewProgressDatabase(`migration-test-${crypto.randomUUID()}`)
  quiz = new QuizProgressDatabase(`migration-test-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
  await cards.delete()
  await quiz.delete()
})
const names = () => ({ flashcards: cards.name, quiz: quiz.name })
it('automatically seeds an empty library previously skipped by the old sample initializer', async () => {
  await db.metadata.bulkPut([
    { id: 'legacy-progress-imported', value: 1 },
    { id: 'sample-vocabulary-initialized', value: 1 },
    { id: 'generation', value: 3 },
  ])
  await initializeStorage(db, names())
  const repository = new IndexedDBVocabularyRepository(db)
  expect(await repository.list()).toHaveLength(5)
  for (const row of await repository.list())
    await repository.delete(row.id, row.updated_at)
  await initializeStorage(db, names())
  expect(await repository.list()).toHaveLength(0)
})

it('adds samples to an empty library whose legacy setup already finished', async () => {
  await db.metadata.put({ id: 'legacy-progress-imported', value: 1 })
  await initializeStorage(db, names())
  const repository = new IndexedDBVocabularyRepository(db)
  expect(await repository.list()).toHaveLength(5)
  for (const row of await repository.list())
    await repository.delete(row.id, row.updated_at)
  await initializeStorage(db, names())
  expect(await repository.list()).toHaveLength(0)
})

it('upgrades the existing v1 library and copies legacy progress once without deleting sources', async () => {
  const original = fixture()
  const legacy = new Dexie(db.name)
  legacy
    .version(1)
    .stores({ vocabulary: 'id, word, part_of_speech, updated_at' })
  await legacy.table('vocabulary').bulkPut(original.data.vocabulary)
  legacy.close()
  await cards.sessions.bulkPut(original.data.flashcardSessions)
  await quiz.sessions.bulkPut(original.data.quizSessions)
  await initializeStorage(db, names())
  expect(await db.vocabulary.toArray()).toEqual(original.data.vocabulary)
  expect(await db.flashcardSessions.toArray()).toEqual(
    original.data.flashcardSessions,
  )
  expect(await db.quizSessions.toArray()).toEqual(original.data.quizSessions)
  expect(await cards.sessions.toArray()).toEqual(
    original.data.flashcardSessions,
  )
  expect(await quiz.sessions.toArray()).toEqual(original.data.quizSessions)
  // An intentionally empty restore must not resurrect legacy progress on startup.
  const repo = new IndexedDBBackupRepository(db)
  const empty = fixture()
  empty.data.flashcardSessions = []
  empty.data.quizSessions = []
  await repo.restore(await repo.preview(empty), 'replace', true)
  await initializeStorage(db, names())
  expect(await db.flashcardSessions.count()).toBe(0)
  expect(await db.quizSessions.count()).toBe(0)
})
it('rolls back failed migrations and retries without duplicate or lost records', async () => {
  const original = fixture()
  await cards.sessions.bulkPut(original.data.flashcardSessions)
  await quiz.sessions.bulkPut(original.data.quizSessions)
  const fail = () => {
    throw new Error('quota failure')
  }
  db.settings.hook('creating', fail)
  await expect(initializeStorage(db, names())).rejects.toThrow('quota failure')
  expect(await db.vocabulary.count()).toBe(0)
  expect(await db.flashcardSessions.count()).toBe(0)
  expect(await db.quizSessions.count()).toBe(0)
  expect(await db.metadata.get('legacy-progress-imported')).toBeUndefined()
  expect(await cards.sessions.count()).toBe(1)
  db.settings.hook('creating').unsubscribe(fail)
  await initializeStorage(db, names())
  expect(await db.flashcardSessions.toArray()).toEqual(
    original.data.flashcardSessions,
  )
})
it('does not create unused legacy databases for a new installation', async () => {
  await initializeStorage(db, names())
  expect(await Dexie.exists(cards.name)).toBe(false)
  expect(await Dexie.exists(quiz.name)).toBe(false)
  expect(await db.settings.get('preferences')).toEqual({
    id: 'preferences',
    flashcardSize: 20,
    quizSize: 10,
  })
})

it('adds five complete editable samples once, preserves deletions and seeds after local data is cleared', async () => {
  await Promise.all([
    initializeStorage(db, names()),
    initializeStorage(db, names()),
  ])
  const repository = new IndexedDBVocabularyRepository(db)
  const rows = await repository.list()
  expect(rows).toHaveLength(5)
  expect(new Set(rows.map((row) => row.id)).size).toBe(5)
  for (const row of rows) {
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(() => validate(row)).not.toThrow()
    for (const field of fieldNames) expect(row[field].trim()).not.toBe('')
  }
  const first = rows[0]!
  const edited = await repository.update(
    first.id,
    { ...first, note: 'My own note' },
    first.updated_at,
  )
  expect(edited.note).toBe('My own note')
  for (const row of await repository.list())
    await repository.delete(row.id, row.updated_at)
  db.close()
  await db.open()
  await initializeStorage(db, names())
  expect(await repository.list()).toEqual([])
  // This isolated test database represents clearing site data in the browser.
  await db.delete()
  await db.open()
  await initializeStorage(db, names())
  expect(await repository.list()).toHaveLength(5)
})

it('does not add samples when an intentionally empty backup was restored before first startup', async () => {
  const backup = fixture()
  backup.data.vocabulary = []
  const repository = new IndexedDBBackupRepository(db)
  await repository.restore(await repository.preview(backup), 'replace', true)
  await initializeStorage(db, names())
  expect(await db.vocabulary.count()).toBe(0)
})
