import { fieldNames, validate, type Vocabulary } from '../vocabulary/model'
import {
  equivalentMeanings,
  normalize,
  type GeneratedQuiz,
  type QuizQuestion,
  type QuizSize,
} from './generator'

export interface QuizSession {
  schemaVersion: 1
  id: string
  requestedSize: QuizSize
  eligibleCount: number
  questions: QuizQuestion[]
  answers: (number | null)[]
  index: number
  finished: boolean
}
export type QuizAction =
  | { type: 'submit'; choice: number }
  | { type: 'previous' | 'next' | 'finish' | 'review' }
export function createQuizSession(
  generated: GeneratedQuiz,
  size: QuizSize,
): QuizSession {
  if (!generated.questions.length)
    throw new Error(
      'Not enough unambiguous vocabulary for a quiz. Add words with English meanings and at least three distinct, unrelated distractor meanings.',
    )
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    requestedSize: size,
    eligibleCount: generated.eligibleCount,
    questions: generated.questions,
    answers: generated.questions.map(() => null),
    index: 0,
    finished: false,
  }
}
export function quizTransition(
  session: QuizSession,
  action: QuizAction,
): QuizSession {
  switch (action.type) {
    case 'submit':
      if (session.finished || session.answers[session.index] !== null)
        return session
      if (
        !Number.isInteger(action.choice) ||
        action.choice < 0 ||
        action.choice > 3
      )
        throw new Error('Choose one of the four answers.')
      return {
        ...session,
        answers: session.answers.map((answer, index) =>
          index === session.index ? action.choice : answer,
        ),
      }
    case 'previous':
      return { ...session, index: Math.max(0, session.index - 1) }
    case 'next':
      return session.answers[session.index] === null
        ? session
        : {
            ...session,
            index: Math.min(session.questions.length - 1, session.index + 1),
          }
    case 'finish':
      return session.answers.every((answer) => answer !== null)
        ? { ...session, finished: true }
        : session
    case 'review':
      return { ...session, index: 0, finished: false }
  }
}
export function quizResults(session: QuizSession) {
  let correct = 0,
    answered = 0
  const missed: Vocabulary[] = []
  session.questions.forEach((question, index) => {
    const answer = session.answers[index]
    if (answer === null || answer === undefined) return
    answered++
    if (answer === question.correctIndex) correct++
    else missed.push(question.target)
  })
  return { correct, answered, missed, total: session.questions.length }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isQuestion(value: unknown): value is QuizQuestion {
  if (
    !object(value) ||
    !object(value.target) ||
    !Array.isArray(value.options) ||
    value.options.length !== 4 ||
    typeof value.correctIndex !== 'number' ||
    !Number.isInteger(value.correctIndex) ||
    value.correctIndex < 0 ||
    value.correctIndex > 3
  )
    return false
  const target = value.target
  if (
    !fieldNames.every((key) => typeof target[key] === 'string') ||
    typeof target.id !== 'string' ||
    !target.id ||
    typeof target.created_at !== 'string' ||
    typeof target.updated_at !== 'string'
  )
    return false
  try {
    validate(target as unknown as Vocabulary)
  } catch {
    return false
  }
  const options = value.options as unknown[]
  if (
    !options.every(
      (option) =>
        typeof option === 'string' &&
        option.trim() &&
        option.length <= 2000 &&
        normalize(option),
    )
  )
    return false
  if (value.options[value.correctIndex] !== target.english_meaning) return false
  return (value.options as string[]).every((option, index, all) =>
    all.slice(index + 1).every((other) => !equivalentMeanings(option, other)),
  )
}
export function isQuizSession(value: unknown): value is QuizSession {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    !value.id ||
    ![10, 20, 50, 'all'].includes(value.requestedSize as QuizSize) ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    !value.questions.every(isQuestion) ||
    typeof value.eligibleCount !== 'number' ||
    !Number.isSafeInteger(value.eligibleCount) ||
    value.eligibleCount < value.questions.length ||
    !Array.isArray(value.answers) ||
    value.answers.length !== value.questions.length ||
    typeof value.index !== 'number' ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= value.questions.length ||
    typeof value.finished !== 'boolean'
  )
    return false
  if (
    value.requestedSize !== 'all' &&
    value.questions.length > (value.requestedSize as number)
  )
    return false
  const words = value.questions.map((question) =>
    normalize(question.target.word),
  )
  if (new Set(words).size !== words.length) return false
  let unanswered = false
  for (const answer of value.answers) {
    if (answer === null) {
      unanswered = true
      continue
    }
    if (
      unanswered ||
      typeof answer !== 'number' ||
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 3
    )
      return false
  }
  return (
    (!value.finished || !unanswered) &&
    (value.index === 0 || value.answers[value.index - 1] !== null)
  )
}
