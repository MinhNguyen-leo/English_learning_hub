import { describe, expect, it } from 'vitest'
import { emptyInput, type Vocabulary } from '../vocabulary/model'
import {
  createSession,
  isStudySession,
  reviewCounts,
  sampleVocabulary,
  transition,
} from './session'

const words: Vocabulary[] = Array.from({ length: 80 }, (_, index) => ({
  ...emptyInput,
  id: `word-${index}`,
  word: `word ${index}`,
  english_meaning: `meaning ${index}`,
  vietnamese_meaning: 'xin chào',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}))
describe('sampling', () => {
  it.each([20, 50, 'all'] as const)(
    'samples %s entries without replacement',
    (size) => {
      const original = structuredClone(words)
      const sample = sampleVocabulary(words, size, () => 0.25)
      expect(sample).toHaveLength(size === 'all' ? 80 : size)
      expect(new Set(sample.map((word) => word.id)).size).toBe(sample.length)
      expect(
        sample.every((word) => words.some((source) => source.id === word.id)),
      ).toBe(true)
      expect(words).toEqual(original)
      expect(sample[0]).not.toBe(
        words.find((word) => word.id === sample[0]?.id),
      )
    },
  )
  it.each([0, 1, 7])('handles a library of %s entries', (count) => {
    expect(sampleVocabulary(words.slice(0, count), 50)).toHaveLength(count)
  })
  it('uses the random source and never samples the same ID twice', () => {
    expect(sampleVocabulary(words, 20, () => 0)).not.toEqual(
      sampleVocabulary(words, 20, () => 0.99),
    )
    expect(sampleVocabulary([words[0]!, words[0]!], 'all')).toHaveLength(1)
  })
  it('rejects empty sessions and invalid random sources', () => {
    expect(() => createSession([], 20)).toThrow('empty')
    expect(() => sampleVocabulary(words, 20, () => 1)).toThrow('Random source')
  })
})
describe('session navigation and reviews', () => {
  it('flips without advancing and navigates within bounds while preserving card selection', () => {
    const original = createSession(words, 20, () => 0)
    expect(transition(original, { type: 'previous' })).toBe(original)
    const flipped = transition(original, { type: 'flip' })
    expect(flipped.index).toBe(0)
    expect(flipped.flipped).toBe(true)
    const next = transition(flipped, { type: 'next' })
    expect(next.index).toBe(1)
    expect(next.flipped).toBe(false)
    expect(transition(next, { type: 'previous' }).cards).toEqual(original.cards)
    let session = original
    for (let index = 0; index < 30; index++)
      session = transition(session, { type: 'next' })
    expect(session.index).toBe(19)
    expect(session.cards).toEqual(original.cards)
    expect(original.index).toBe(0)
  })
  it('captures a snapshot independent of repository edits and deletion', () => {
    const library = structuredClone(words)
    const session = createSession(library, 'all', () => 0.5)
    const snapshot = structuredClone(session.cards)
    library.forEach((word) => {
      word.word = 'changed'
      word.english_meaning = 'changed meaning'
    })
    library.splice(0)
    expect(transition(session, { type: 'next' }).cards).toEqual(snapshot)
  })
  it('handles one card and replaces review classifications rather than double-counting', () => {
    const session = createSession(words.slice(0, 1), 20)
    expect(transition(session, { type: 'next' }).index).toBe(0)
    const remembered = transition(session, {
      type: 'review',
      status: 'remembered',
    })
    const changed = transition(remembered, {
      type: 'review',
      status: 'not-remembered',
    })
    expect(reviewCounts(changed)).toEqual({
      remembered: 0,
      notRemembered: 1,
      unreviewed: 0,
    })
    expect(session.reviews).toEqual([])
  })
  it('shuffles only the selected cards, retains reviews by ID and restarts the same selection', () => {
    const original = createSession(words, 20, () => 0)
    const rated = transition(
      transition(original, { type: 'review', status: 'remembered' }),
      { type: 'next' },
    )
    const shuffled = transition(rated, { type: 'shuffle' }, () => 0.4)
    expect(shuffled.cards.map((word) => word.id).sort()).toEqual(
      original.cards.map((word) => word.id).sort(),
    )
    expect(shuffled.cards).not.toEqual(original.cards)
    expect(shuffled.reviews).toEqual(rated.reviews)
    expect(shuffled.index).toBe(0)
    const restarted = transition(shuffled, { type: 'restart' })
    expect(restarted.cards).toEqual(shuffled.cards)
    expect(restarted.reviews).toEqual([])
    expect(restarted.flipped).toBe(false)
  })
  it('validates stored session boundaries and review identities', () => {
    const session = createSession(words, 20)
    expect(isStudySession(session)).toBe(true)
    expect(isStudySession({ ...session, index: 20 })).toBe(false)
    expect(isStudySession({ ...session, cards: [] })).toBe(false)
    expect(isStudySession({ ...session, schemaVersion: 2 })).toBe(false)
    expect(
      isStudySession({
        ...session,
        cards: [session.cards[0], session.cards[0]],
      }),
    ).toBe(false)
    expect(
      isStudySession({
        ...session,
        reviews: [{ id: 'missing', status: 'remembered' }],
      }),
    ).toBe(false)
    expect(
      isStudySession({
        ...session,
        reviews: [{ id: session.cards[0]!.id, status: 'invalid' }],
      }),
    ).toBe(false)
  })
})
