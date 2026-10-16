import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { ApplicationDatabase } from '../db/ApplicationDatabase'
import { IndexedDBReviewProgressRepository } from '../features/flashcards/progressRepository'
import { createSession, transition } from '../features/flashcards/session'
import { IndexedDBQuizProgressRepository } from '../features/quiz/progressRepository'
import { generateQuiz } from '../features/quiz/generator'
import {
  createQuizSession,
  quizResults,
  quizTransition,
} from '../features/quiz/session'
import { seededRandom, vocabulary } from '../features/quiz/testSupport'
import { normalizeStudyText } from './study'

it('retains mistakes in the application database across reopening and uses them for review sampling', async () => {
  const db = new ApplicationDatabase(`test-study-review-${crypto.randomUUID()}`)
  const reopened = new ApplicationDatabase(db.name)
  try {
    const rows = vocabulary(30)
    const flashcards = new IndexedDBReviewProgressRepository(db, 0)
    const quiz = new IndexedDBQuizProgressRepository(db, 0)
    const cards = createSession(rows, 20, seededRandom(1))
    const savedCards = await flashcards.save(
      transition(cards, { type: 'review', status: 'not-remembered' }),
      null,
    )
    const questions = createQuizSession(
      generateQuiz(rows, 10, seededRandom(2)),
      10,
    )
    const savedQuiz = await quiz.save(
      quizTransition(questions, {
        type: 'submit',
        choice: (questions.questions[0]!.correctIndex + 1) % 4,
      }),
      null,
    )
    db.close()
    const storedCards = (await new IndexedDBReviewProgressRepository(
      reopened,
      0,
    ).load())!
    const storedQuiz = (await new IndexedDBQuizProgressRepository(
      reopened,
      0,
    ).load())!
    expect(storedCards).toEqual(savedCards)
    expect(storedQuiz).toEqual(savedQuiz)
    const missedCard = storedCards.session.cards.find(
      (card) => card.id === storedCards.session.reviews[0]!.id,
    )!
    const nextCards = createSession(
      rows,
      20,
      seededRandom(3),
      new Set([normalizeStudyText(missedCard.word)]),
    )
    expect(nextCards.cards[0]!.id).toBe(missedCard.id)
    const missedQuizWord = quizResults(storedQuiz.session).missed[0]!
    const nextQuiz = generateQuiz(
      rows,
      10,
      seededRandom(3),
      new Set([normalizeStudyText(missedQuizWord.word)]),
    )
    expect(nextQuiz.questions[0]!.target.id).toBe(missedQuizWord.id)
    // Sampling alone never clears the committed review marks or answers.
    expect(
      await new IndexedDBReviewProgressRepository(reopened, 0).load(),
    ).toEqual(savedCards)
    expect(
      await new IndexedDBQuizProgressRepository(reopened, 0).load(),
    ).toEqual(savedQuiz)
  } finally {
    db.close()
    await reopened.delete()
  }
})
