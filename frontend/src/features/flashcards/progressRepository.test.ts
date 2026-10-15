import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyInput } from '../vocabulary/model'
import { createSession, transition } from './session'
import {
  IndexedDBReviewProgressRepository,
  ReviewProgressDatabase,
} from './progressRepository'

let db: ReviewProgressDatabase
let repository: IndexedDBReviewProgressRepository
const words = Array.from({ length: 4 }, (_, index) => ({
  ...emptyInput,
  id: `word-${index}`,
  word: `word ${index}`,
  english_meaning: `meaning ${index}`,
  vietnamese_meaning: 'xin chào',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}))
beforeEach(() => {
  db = new ReviewProgressDatabase(`test-flashcards-${crypto.randomUUID()}`)
  repository = new IndexedDBReviewProgressRepository(db)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})
it('starts empty and persists card order, content, position, flip and reviews after reopening', async () => {
  expect(await repository.load()).toBeNull()
  const start = await repository.save(
    createSession(words, 20, () => 0),
    null,
  )
  const reviewed = transition(start.session, {
    type: 'review',
    status: 'not-remembered',
  })
  const navigated = transition(transition(reviewed, { type: 'next' }), {
    type: 'flip',
  })
  const saved = await repository.save(navigated, start.revision)
  db.close()
  const reopened = new ReviewProgressDatabase(db.name)
  try {
    expect(
      await new IndexedDBReviewProgressRepository(reopened).load(),
    ).toEqual(saved)
  } finally {
    reopened.close()
  }
})
it('persists shuffled order and restart without changing the selected IDs', async () => {
  const initial = await repository.save(createSession(words, 'all'), null)
  const shuffled = await repository.save(
    transition(initial.session, { type: 'shuffle' }, () => 0),
    initial.revision,
  )
  expect((await repository.load())?.session.cards).toEqual(
    shuffled.session.cards,
  )
  const reviewed = await repository.save(
    transition(shuffled.session, { type: 'review', status: 'remembered' }),
    shuffled.revision,
  )
  const restarted = await repository.save(
    transition(reviewed.session, { type: 'restart' }),
    reviewed.revision,
  )
  expect((await repository.load())?.session).toEqual(restarted.session)
  expect(restarted.session.cards).toEqual(shuffled.session.cards)
  expect(restarted.session.reviews).toEqual([])
})
it('rejects competing tab changes without overwriting progress', async () => {
  const initial = await repository.save(createSession(words, 20), null)
  const updated = await repository.save(
    transition(initial.session, { type: 'next' }),
    initial.revision,
  )
  await expect(
    repository.save(initial.session, initial.revision),
  ).rejects.toThrow('another tab')
  await expect(repository.save(createSession(words, 20), null)).rejects.toThrow(
    'another tab',
  )
  expect(await repository.load()).toEqual(updated)
})
it('rolls back failed storage writes and permits retry against the last saved revision', async () => {
  const initial = await repository.save(createSession(words, 20), null)
  const fail = () => {
    throw new Error('quota exceeded')
  }
  db.sessions.hook('updating', fail)
  const changed = transition(initial.session, {
    type: 'review',
    status: 'remembered',
  })
  await expect(repository.save(changed, initial.revision)).rejects.toThrow(
    'not saved',
  )
  expect(await repository.load()).toEqual(initial)
  db.sessions.hook('updating').unsubscribe(fail)
  await expect(
    repository.save(changed, initial.revision),
  ).resolves.toMatchObject({ session: changed })
})
it('reports storage read errors', async () => {
  vi.spyOn(db.sessions, 'get').mockRejectedValue(
    new DOMException('denied', 'SecurityError'),
  )
  await expect(repository.load()).rejects.toThrow('storage')
})
it('rejects corrupt persisted sessions without overwriting them', async () => {
  const saved = await repository.save(createSession(words, 20), null)
  await db.sessions.put({ ...saved, session: { ...saved.session, index: -1 } })
  await expect(repository.load()).rejects.toThrow('invalid')
  await expect(repository.save(saved.session, saved.revision)).rejects.toThrow(
    'invalid',
  )
  expect((await db.sessions.get('active'))?.session.index).toBe(-1)
})
