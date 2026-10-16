import { describe, expect, it } from 'vitest'
import { createSession, transition } from '../flashcards/session'
import { generateQuiz } from '../quiz/generator'
import { createQuizSession } from '../quiz/session'
import { vocabulary, seededRandom } from '../quiz/testSupport'
import { calculateMetrics, type DashboardSnapshot } from './metrics'

function snapshot(): DashboardSnapshot {
  const words = vocabulary(6)
  return {
    vocabularyIds: words.map((word) => word.id),
    flashcards: createSession(words, 'all', seededRandom(10)),
    quiz: createQuizSession(generateQuiz(words, 10, seededRandom(42)), 10),
  }
}
describe('persisted-session dashboard metrics', () => {
  it('shows empty metrics without inventing accuracy, due dates or history', () => {
    expect(
      calculateMetrics({ vocabularyIds: [], flashcards: null, quiz: null }),
    ).toEqual({
      total: 0,
      newWords: 0,
      learning: 0,
      learned: 0,
      dueToday: null,
      accuracy: null,
      flashcards: null,
      quiz: null,
      history: null,
    })
  })
  it('keeps selected but unreviewed words new, including an unanswered quiz', () => {
    expect(calculateMetrics(snapshot())).toMatchObject({
      total: 6,
      newWords: 6,
      learned: 0,
      learning: 0,
      accuracy: null,
    })
  })
  it('partitions the library by ID and gives negative results precedence without assuming recency', () => {
    const saved = snapshot(),
      questions = saved.quiz!.questions
    saved.quiz!.answers = questions.map((q, i) =>
      i < 3 ? (i === 1 ? (q.correctIndex + 1) % 4 : q.correctIndex) : null,
    )
    saved.flashcards!.reviews = [
      { id: questions[0]!.target.id, status: 'remembered' },
      { id: questions[1]!.target.id, status: 'remembered' },
      { id: questions[3]!.target.id, status: 'not-remembered' },
    ]
    const metrics = calculateMetrics(saved)
    expect(metrics).toMatchObject({
      total: 6,
      newWords: 2,
      learning: 3,
      learned: 1,
      quiz: { correct: 2, answered: 3, total: 6 },
    })
    expect(metrics.accuracy).toBeCloseTo(200 / 3)
    expect(metrics.newWords + metrics.learning + metrics.learned).toBe(
      metrics.total,
    )
  })
  it('excludes deleted vocabulary from categories but retains actual saved quiz accuracy and activity', () => {
    const saved = snapshot()
    const q = saved.quiz!.questions[0]!
    saved.quiz!.answers[0] = q.correctIndex
    saved.flashcards!.reviews = [{ id: q.target.id, status: 'remembered' }]
    saved.vocabularyIds = saved.vocabularyIds.filter((id) => id !== q.target.id)
    expect(calculateMetrics(saved)).toMatchObject({
      total: 5,
      newWords: 5,
      learned: 0,
      learning: 0,
      accuracy: 100,
      flashcards: { remembered: 1 },
      quiz: { correct: 1, answered: 1 },
    })
  })
  it('reports zero accuracy for wrong answers rather than claiming there are no answers', () => {
    const saved = snapshot()
    // Choice zero is a submitted answer, not an empty value.
    saved.quiz!.questions[0]!.correctIndex = 1
    saved.quiz!.answers[0] = 0
    expect(calculateMetrics(saved)).toMatchObject({
      accuracy: 0,
      quiz: { answered: 1, correct: 0 },
      learning: 1,
    })
  })
  it('counts separate meanings as separate entries and does not count repeated IDs twice', () => {
    const saved = snapshot()
    const cards = saved.flashcards!.cards
    cards[0]!.word = cards[1]!.word
    saved.flashcards!.reviews = [{ id: cards[0]!.id, status: 'remembered' }]
    saved.vocabularyIds.push(cards[0]!.id)
    expect(calculateMetrics(saved)).toMatchObject({
      total: 6,
      learned: 1,
      newWords: 5,
    })
  })
  it('reflects a saved restart and does not recreate discarded review history', () => {
    const saved = snapshot()
    saved.flashcards = transition(saved.flashcards!, {
      type: 'review',
      status: 'remembered',
    })
    expect(calculateMetrics(saved).learned).toBe(1)
    saved.flashcards = transition(saved.flashcards, { type: 'restart' })
    expect(calculateMetrics(saved)).toMatchObject({
      learned: 0,
      newWords: 6,
      history: null,
    })
  })
  it('uses only submitted answers and the saved completion flag for completed quizzes', () => {
    const saved = snapshot()
    saved.quiz!.answers = saved.quiz!.questions.map((q) => q.correctIndex)
    saved.quiz!.finished = true
    expect(calculateMetrics(saved)).toMatchObject({
      accuracy: 100,
      learning: 6,
      learned: 0,
      quiz: { answered: 6, finished: true },
    })
  })
})
