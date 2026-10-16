import { reviewCounts, type StudySession } from '../flashcards/session'
import { quizResults, type QuizSession } from '../quiz/session'

export interface DashboardSnapshot {
  vocabularyIds: string[]
  flashcards: StudySession | null
  quiz: QuizSession | null
}

// These are retained-session classifications, not an SRS or lifetime mastery model.
// A negative result wins conflicts because sessions have no review timestamps.
export function calculateMetrics(snapshot: DashboardSnapshot) {
  const ids = new Set(snapshot.vocabularyIds)
  const studied = new Set<string>()
  const remembered = new Set<string>()
  const missed = new Set<string>()
  for (const review of snapshot.flashcards?.reviews ?? []) {
    studied.add(review.id)
    if (review.status === 'remembered') remembered.add(review.id)
    else missed.add(review.id)
  }
  snapshot.quiz?.questions.forEach((question, index) => {
    const answer = snapshot.quiz?.answers[index]
    if (answer === null || answer === undefined) return
    studied.add(question.target.id)
    if (answer !== question.correctIndex) missed.add(question.target.id)
  })
  let newWords = 0,
    learning = 0,
    learned = 0
  for (const id of ids) {
    if (!studied.has(id)) newWords++
    else if (remembered.has(id) && !missed.has(id)) learned++
    else learning++
  }
  const quiz = snapshot.quiz ? quizResults(snapshot.quiz) : null
  return {
    total: ids.size,
    newWords,
    learning,
    learned,
    dueToday: null,
    accuracy: quiz?.answered ? (quiz.correct / quiz.answered) * 100 : null,
    flashcards: snapshot.flashcards
      ? {
          ...reviewCounts(snapshot.flashcards),
          total: snapshot.flashcards.cards.length,
        }
      : null,
    quiz: quiz
      ? {
          correct: quiz.correct,
          answered: quiz.answered,
          total: quiz.total,
          finished: snapshot.quiz!.finished,
        }
      : null,
    history: null,
  }
}
export type DashboardMetrics = ReturnType<typeof calculateMetrics>
