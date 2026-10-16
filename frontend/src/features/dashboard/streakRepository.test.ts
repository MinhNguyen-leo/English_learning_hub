import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApplicationDatabase } from '../../db/ApplicationDatabase'
import { IndexedDBStreakRepository } from './streakRepository'

let db: ApplicationDatabase
beforeEach(() => {
  db = new ApplicationDatabase(`streak-test-${crypto.randomUUID()}`)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

it('counts one visit per local calendar day and persists across reopening', async () => {
  let repository = new IndexedDBStreakRepository(db)
  expect(await repository.recordVisit(new Date(2026, 9, 16, 0, 1))).toBe(1)
  expect(await repository.recordVisit(new Date(2026, 9, 16, 23, 59))).toBe(1)
  db.close()
  db = new ApplicationDatabase(db.name)
  repository = new IndexedDBStreakRepository(db)
  expect(await repository.recordVisit(new Date(2026, 9, 17, 0, 1))).toBe(2)
  expect(await repository.recordVisit(new Date(2026, 9, 19))).toBe(1)
})

it('handles month/year boundaries and backwards clock changes', async () => {
  const repository = new IndexedDBStreakRepository(db)
  expect(await repository.recordVisit(new Date(2026, 11, 31))).toBe(1)
  expect(await repository.recordVisit(new Date(2027, 0, 1))).toBe(2)
  expect(await repository.recordVisit(new Date(2026, 11, 31))).toBe(2)
  expect(await repository.recordVisit(new Date(2027, 0, 2))).toBe(3)
})

it('does not double count simultaneous visits from different tabs', async () => {
  const other = new ApplicationDatabase(db.name)
  try {
    const repositories = [db, other].map(
      (connection) => new IndexedDBStreakRepository(connection),
    )
    await repositories[0]!.recordVisit(new Date(2026, 9, 16))
    expect(
      await Promise.all(
        repositories.map((repository) =>
          repository.recordVisit(new Date(2026, 9, 17)),
        ),
      ),
    ).toEqual([2, 2])
  } finally {
    other.close()
  }
})

it('preserves saved data when storage fails and permits retry', async () => {
  const repository = new IndexedDBStreakRepository(db)
  await repository.recordVisit(new Date(2026, 9, 16))
  vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Storage denied'))
  await expect(repository.recordVisit(new Date(2026, 9, 17))).rejects.toThrow(
    'Storage denied',
  )
  expect((await db.metadata.get('streak-days'))?.value).toBe(1)
  expect(await repository.recordVisit(new Date(2026, 9, 17))).toBe(2)
})
