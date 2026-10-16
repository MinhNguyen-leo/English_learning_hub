import { fieldNames, validate, type Vocabulary } from '../vocabulary/model'
import { normalizeStudyText, prioritizeMistakes } from '../../lib/study'

export type SessionSize = 20 | 50 | 'all'
export type ReviewStatus = 'remembered' | 'not-remembered'
export interface StudySession {
  schemaVersion: 1
  id: string
  cards: Vocabulary[]
  index: number
  flipped: boolean
  reviews: { id: string; status: ReviewStatus }[]
}
export type StudyAction =
  | { type: 'flip' }
  | { type: 'previous' | 'next' }
  | { type: 'review'; status: ReviewStatus }
  | { type: 'shuffle' }
  | { type: 'restart' }

export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error(
        'Random source must return a value between 0 (inclusive) and 1 (exclusive).',
      )
    const target = Math.floor(value * (index + 1))
    const current = result[index]!
    result[index] = result[target]!
    result[target] = current
  }
  return result
}
export function sampleVocabulary(
  rows: readonly Vocabulary[],
  size: SessionSize,
  random: () => number = Math.random,
  mistakes: ReadonlySet<string> = new Set(),
): Vocabulary[] {
  if (size !== 20 && size !== 50 && size !== 'all')
    throw new Error('Choose 20, 50 or all words.')
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()]
  const seen = new Set<string>()
  return prioritizeMistakes(
    shuffled(unique, random),
    (row) => row.word,
    mistakes,
  )
    .filter((row) => {
      const word = normalizeStudyText(row.word)
      if (!word || seen.has(word)) return false
      seen.add(word)
      return true
    })
    .slice(0, size === 'all' ? unique.length : size)
    .map((row) => ({ ...row }))
}
export function createSession(
  rows: readonly Vocabulary[],
  size: SessionSize,
  random: () => number = Math.random,
  mistakes: ReadonlySet<string> = new Set(),
): StudySession {
  const cards = sampleVocabulary(rows, size, random, mistakes)
  if (!cards.length)
    throw new Error(
      'Your vocabulary library is empty. Add words before starting a session.',
    )
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    cards,
    index: 0,
    flipped: false,
    reviews: [],
  }
}
export function transition(
  session: StudySession,
  action: StudyAction,
  random: () => number = Math.random,
): StudySession {
  switch (action.type) {
    case 'flip':
      return { ...session, flipped: !session.flipped }
    case 'previous':
    case 'next': {
      const index = Math.max(
        0,
        Math.min(
          session.cards.length - 1,
          session.index + (action.type === 'next' ? 1 : -1),
        ),
      )
      return index === session.index
        ? session
        : { ...session, index, flipped: false }
    }
    case 'review': {
      const card = session.cards[session.index]
      if (!card) return session
      return {
        ...session,
        reviews: [
          ...session.reviews.filter((review) => review.id !== card.id),
          { id: card.id, status: action.status },
        ],
      }
    }
    case 'shuffle':
      return {
        ...session,
        cards: shuffled(session.cards, random),
        index: 0,
        flipped: false,
      }
    case 'restart':
      return { ...session, index: 0, flipped: false, reviews: [] }
  }
}
export function reviewCounts(session: StudySession) {
  const remembered = session.reviews.filter(
    (review) => review.status === 'remembered',
  ).length
  const notRemembered = session.reviews.length - remembered
  return {
    remembered,
    notRemembered,
    unreviewed: session.cards.length - session.reviews.length,
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isCard(value: unknown): value is Vocabulary {
  if (
    !object(value) ||
    !fieldNames.every((field) => typeof value[field] === 'string') ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  )
    return false
  try {
    validate(value as unknown as Vocabulary)
    return true
  } catch {
    return false
  }
}
export function isStudySession(value: unknown): value is StudySession {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    !value.id ||
    !Array.isArray(value.cards) ||
    !value.cards.length ||
    !value.cards.every(isCard) ||
    !Number.isInteger(value.index) ||
    typeof value.index !== 'number' ||
    value.index < 0 ||
    value.index >= value.cards.length ||
    typeof value.flipped !== 'boolean' ||
    !Array.isArray(value.reviews)
  )
    return false
  const ids = new Set(value.cards.map((card) => card.id))
  if (ids.size !== value.cards.length) return false
  const reviewed = new Set<string>()
  return value.reviews.every((review: unknown) => {
    if (
      !object(review) ||
      typeof review.id !== 'string' ||
      !ids.has(review.id) ||
      reviewed.has(review.id) ||
      (review.status !== 'remembered' && review.status !== 'not-remembered')
    )
      return false
    reviewed.add(review.id)
    return true
  })
}
