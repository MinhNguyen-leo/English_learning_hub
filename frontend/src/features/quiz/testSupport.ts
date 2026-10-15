import { emptyInput, type Vocabulary } from '../vocabulary/model'
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}
export function word(
  id: string,
  english: string,
  extra: Partial<Vocabulary> = {},
): Vocabulary {
  return {
    ...emptyInput,
    id,
    word: id,
    english_meaning: english,
    part_of_speech: 'noun',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}
export function vocabulary(count = 60): Vocabulary[] {
  return Array.from({ length: count }, (_, index) =>
    word(`term-${index}`, `Definition ${index}`),
  )
}
