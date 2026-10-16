import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApplicationDatabase } from '../../db/ApplicationDatabase'
import { fixture } from '../backup/testSupport'
import { IndexedDBDashboardRepository } from './repository'
import { calculateMetrics, type DashboardSnapshot } from './metrics'

let db: ApplicationDatabase
beforeEach(() => {
  db = new ApplicationDatabase(`dashboard-test-${crypto.randomUUID()}`)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})
it('reads persisted progress in a consistent snapshot after reopening storage', async () => {
  const backup = fixture()
  await db.transaction(
    'rw',
    [db.vocabulary, db.flashcardSessions, db.quizSessions],
    async () => {
      await db.vocabulary.bulkPut(backup.data.vocabulary)
      await db.flashcardSessions.bulkPut(backup.data.flashcardSessions)
      await db.quizSessions.bulkPut(backup.data.quizSessions)
    },
  )
  db.close()
  db = new ApplicationDatabase(db.name)
  const snapshot = await new IndexedDBDashboardRepository(db).load()
  expect(snapshot.vocabularyIds).toEqual(
    backup.data.vocabulary.map((word) => word.id),
  )
  expect(snapshot.flashcards).toEqual(backup.data.flashcardSessions[0]!.session)
  expect(snapshot.quiz).toEqual(backup.data.quizSessions[0]!.session)
  expect(calculateMetrics(snapshot).accuracy).toBe(0)
  expect(await db.metadata.count()).toBe(0)
})
it('updates subscriptions after committed changes from another database connection', async () => {
  const other = new ApplicationDatabase(db.name)
  const snapshots: DashboardSnapshot[] = []
  const errors: unknown[] = []
  const unsubscribe = new IndexedDBDashboardRepository(db).subscribe(
    (value) => snapshots.push(value),
    (error) => errors.push(error),
  )
  try {
    await vi.waitFor(() => expect(snapshots.at(-1)?.vocabularyIds).toEqual([]))
    const backup = fixture()
    await other.transaction(
      'rw',
      [other.vocabulary, other.flashcardSessions, other.quizSessions],
      async () => {
        await other.vocabulary.bulkPut(backup.data.vocabulary)
        await other.flashcardSessions.bulkPut(backup.data.flashcardSessions)
        await other.quizSessions.bulkPut(backup.data.quizSessions)
      },
    )
    await vi.waitFor(() =>
      expect(snapshots.at(-1)?.quiz).toEqual(
        backup.data.quizSessions[0]!.session,
      ),
    )
    expect(snapshots.at(-1)?.vocabularyIds).toHaveLength(5)
    expect(snapshots.at(-1)?.flashcards).toEqual(
      backup.data.flashcardSessions[0]!.session,
    )
    expect(errors).toEqual([])
  } finally {
    unsubscribe()
    other.close()
  }
})
it('reports corrupt progress rather than displaying fabricated zero results', async () => {
  await db.flashcardSessions.put({
    ...fixture().data.flashcardSessions[0]!,
    revision: 0,
  })
  await expect(new IndexedDBDashboardRepository(db).load()).rejects.toThrow(
    'Could not read dashboard data',
  )
  expect(await db.flashcardSessions.count()).toBe(1)
})
it('reports storage failures without mutating any persisted data', async () => {
  vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Storage denied'))
  await expect(new IndexedDBDashboardRepository(db).load()).rejects.toThrow(
    'No data was changed',
  )
  expect(await db.vocabulary.count()).toBe(0)
})
