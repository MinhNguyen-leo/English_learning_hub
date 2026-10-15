import { expect, it } from 'vitest'
import { generateQuiz } from './generator'
import {
  createQuizSession,
  isQuizSession,
  quizResults,
  quizTransition,
} from './session'
import { seededRandom, vocabulary } from './testSupport'
const create = () =>
  createQuizSession(generateQuiz(vocabulary(6), 10, seededRandom(42)), 10)
it('locks each submitted answer, reveals its correct answer and scores it once', () => {
  const session = create(),
    question = session.questions[0]!
  const answered = quizTransition(session, {
    type: 'submit',
    choice: question.correctIndex,
  })
  expect(quizResults(answered)).toMatchObject({
    correct: 1,
    answered: 1,
    missed: [],
  })
  expect(
    quizTransition(answered, {
      type: 'submit',
      choice: (question.correctIndex + 1) % 4,
    }),
  ).toBe(answered)
  expect(session.answers[0]).toBeNull()
})
it('prevents skipping unanswered questions and preserves questions/options during review', () => {
  const session = create()
  expect(quizTransition(session, { type: 'next' })).toBe(session)
  expect(quizTransition(session, { type: 'finish' })).toBe(session)
  const submitted = quizTransition(session, { type: 'submit', choice: 0 })
  const next = quizTransition(submitted, { type: 'next' })
  expect(next.index).toBe(1)
  expect(quizTransition(next, { type: 'previous' }).questions).toEqual(
    session.questions,
  )
})
it('tracks score and missed snapshots, finishes and reviews without resetting scores', () => {
  let session = create()
  const missed = session.questions[0]!.target
  for (let i = 0; i < session.questions.length; i++) {
    const correct = session.questions[i]!.correctIndex
    session = quizTransition(session, {
      type: 'submit',
      choice: i === 0 ? (correct + 1) % 4 : correct,
    })
    if (i < session.questions.length - 1)
      session = quizTransition(session, { type: 'next' })
  }
  session = quizTransition(session, { type: 'finish' })
  expect(session.finished).toBe(true)
  expect(quizResults(session)).toEqual({
    correct: 5,
    answered: 6,
    total: 6,
    missed: [missed],
  })
  const review = quizTransition(session, { type: 'review' })
  expect(review.index).toBe(0)
  expect(review.finished).toBe(false)
  expect(quizResults(review)).toEqual(quizResults(session))
})
it('validates persisted indices, answer order, target uniqueness and option uniqueness', () => {
  const session = create()
  expect(isQuizSession(session)).toBe(true)
  expect(isQuizSession({ ...session, index: 1 })).toBe(false)
  expect(isQuizSession({ ...session, finished: true })).toBe(false)
  expect(
    isQuizSession({
      ...session,
      questions: [session.questions[0], session.questions[0]],
    }),
  ).toBe(false)
  expect(
    isQuizSession({ ...session, answers: [null, 0, null, null, null, null] }),
  ).toBe(false)
  const changed = structuredClone(session)
  changed.questions[0]!.options[0] = changed.questions[0]!.options[1]
  expect(isQuizSession(changed)).toBe(false)
  expect(() => quizTransition(session, { type: 'submit', choice: 4 })).toThrow(
    'four answers',
  )
  expect(() =>
    createQuizSession({ questions: [], eligibleCount: 0 }, 10),
  ).toThrow('Not enough')
})
