import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateQuiz } from './generator'
import { createQuizSession, quizResults, quizTransition } from './session'
import {
  IndexedDBQuizProgressRepository,
  QuizProgressDatabase,
} from './progressRepository'
import { seededRandom, vocabulary } from './testSupport'
let db: QuizProgressDatabase
let progress: IndexedDBQuizProgressRepository
const session = () =>
  createQuizSession(generateQuiz(vocabulary(5), 10, seededRandom(42)), 10)
beforeEach(() => {
  db = new QuizProgressDatabase(`test-quiz-${crypto.randomUUID()}`)
  progress = new IndexedDBQuizProgressRepository(db)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})
it('persists generated questions, answer positions, submissions and review position after reopening', async () => {
  expect(await progress.load()).toBeNull()
  const first = await progress.save(session(), null)
  const answered = quizTransition(first.session, {
    type: 'submit',
    choice: (first.session.questions[0]!.correctIndex + 1) % 4,
  })
  const saved = await progress.save(
    quizTransition(answered, { type: 'next' }),
    first.revision,
  )
  db.close()
  const reopened = new QuizProgressDatabase(db.name)
  try {
    const loaded = await new IndexedDBQuizProgressRepository(reopened).load()
    expect(loaded).toEqual(saved)
    expect(quizResults(loaded!.session).missed).toHaveLength(1)
  } finally {
    reopened.close()
  }
})
it('rejects stale saves from another tab and preserves the newer result', async () => {
  const first = await progress.save(session(), null)
  const submitted = await progress.save(
    quizTransition(first.session, { type: 'submit', choice: 0 }),
    first.revision,
  )
  await expect(progress.save(first.session, first.revision)).rejects.toThrow(
    'another tab',
  )
  await expect(progress.save(session(), null)).rejects.toThrow('another tab')
  expect(await progress.load()).toEqual(submitted)
})
it('rolls back failed writes without losing answers and supports retry', async () => {
  const first = await progress.save(session(), null)
  const fail = () => {
    throw new Error('quota exceeded')
  }
  db.sessions.hook('updating', fail)
  const changed = quizTransition(first.session, { type: 'submit', choice: 2 })
  await expect(progress.save(changed, first.revision)).rejects.toThrow(
    'not saved',
  )
  expect(await progress.load()).toEqual(first)
  db.sessions.hook('updating').unsubscribe(fail)
  await expect(progress.save(changed, first.revision)).resolves.toMatchObject({
    session: changed,
  })
})
it('reports corrupt saved state without overwriting it', async () => {
  const first = await progress.save(session(), null)
  await db.sessions.put({ ...first, session: { ...first.session, index: 999 } })
  await expect(progress.load()).rejects.toThrow('invalid')
  await expect(progress.save(first.session, first.revision)).rejects.toThrow(
    'invalid',
  )
  expect((await db.sessions.get('active'))?.session.index).toBe(999)
})
it('reports unavailable storage', async () => {
  vi.spyOn(db.sessions, 'get').mockRejectedValue(
    new DOMException('denied', 'SecurityError'),
  )
  await expect(progress.load()).rejects.toThrow('storage failed')
})
it('retains finished results and missed vocabulary for review', async () => {
  let current = session()
  for (let index = 0; index < current.questions.length; index++) {
    current = quizTransition(current, {
      type: 'submit',
      choice: (current.questions[index]!.correctIndex + 1) % 4,
    })
    current = quizTransition(current, { type: 'next' })
  }
  current = quizTransition(current, { type: 'finish' })
  const saved = await progress.save(current, null)
  expect((await progress.load())?.session.finished).toBe(true)
  expect(quizResults(saved.session).missed).toHaveLength(
    current.questions.length,
  )
  const reviewed = await progress.save(
    quizTransition(current, { type: 'review' }),
    saved.revision,
  )
  expect(reviewed.session.answers).toEqual(current.answers)
})
