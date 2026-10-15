import { describe, expect, it } from 'vitest'
import { equivalentMeanings, generateQuiz, normalize } from './generator'
import { seededRandom, vocabulary, word } from './testSupport'

describe('seeded question generation', () => {
  it('generates identical quizzes from a fixed seed without mutating the library', () => {
    const rows = vocabulary(),
      original = structuredClone(rows)
    expect(generateQuiz(rows, 20, seededRandom(42))).toEqual(
      generateQuiz(rows, 20, seededRandom(42)),
    )
    expect(generateQuiz(rows, 20, seededRandom(42))).not.toEqual(
      generateQuiz(rows, 20, seededRandom(43)),
    )
    expect(rows).toEqual(original)
  })
  it.each([10, 20, 50, 'all'] as const)(
    'supports %s questions with four distinct options and one correct answer',
    (size) => {
      const result = generateQuiz(vocabulary(), size, seededRandom(42))
      expect(result.questions).toHaveLength(size === 'all' ? 60 : size)
      expect(result.eligibleCount).toBe(60)
      expect(
        new Set(
          result.questions.map((question) => normalize(question.target.word)),
        ).size,
      ).toBe(result.questions.length)
      for (const question of result.questions) {
        expect(question.options).toHaveLength(4)
        expect(question.options[question.correctIndex]).toBe(
          question.target.english_meaning,
        )
        question.options.forEach((option, index) =>
          question.options
            .slice(index + 1)
            .forEach((other) =>
              expect(equivalentMeanings(option, other)).toBe(false),
            ),
        )
      }
      expect(
        new Set(result.questions.map((question) => question.correctIndex)).size,
      ).toBeGreaterThan(1)
    },
  )
  it.each([0, 1, 2, 3])(
    'returns no questions for %s available meanings',
    (count) => {
      expect(generateQuiz(vocabulary(count), 10, seededRandom(1))).toEqual({
        questions: [],
        eligibleCount: 0,
      })
    },
  )
  it('uses fewer eligible questions gracefully and excludes empty English meanings', () => {
    const rows = [
      ...vocabulary(4),
      word('vietnamese-only', '', { vietnamese_meaning: 'xin chào' }),
    ]
    const result = generateQuiz(rows, 50, seededRandom(8))
    expect(result.questions).toHaveLength(4)
    expect(
      result.questions.every(
        (question) => question.target.id !== 'vietnamese-only',
      ),
    ).toBe(true)
  })
  it('never repeats a normalized target word with multiple records or meanings', () => {
    const rows = [
      ...vocabulary(8),
      word('duplicate', 'Another definition', { word: ' TERM-0 ' }),
    ]
    const result = generateQuiz(rows, 'all', seededRandom(4))
    expect(
      result.questions.filter(
        (question) => normalize(question.target.word) === 'term 0',
      ),
    ).toHaveLength(1)
    for (const question of result.questions.filter(
      (question) => normalize(question.target.word) === 'term 0',
    )) {
      const incorrect = question.options.filter(
        (_, index) => index !== question.correctIndex,
      )
      expect(incorrect).not.toContain('Another definition')
      expect(incorrect).not.toContain('Definition 0')
    }
  })
  it('prefers same part of speech and uses related note tags as a tiebreaker', () => {
    const rows = [
      word('target', 'A celestial body', {
        note: '#space',
        part_of_speech: 'n.',
      }),
      word('tag-a', 'An orbital vehicle', { note: '#space' }),
      word('tag-b', 'A launch facility', { note: '#space' }),
      word('same-pos', 'A tiny insect'),
      word('other-a', 'To paint a portrait', {
        part_of_speech: 'verb',
        note: '#space',
      }),
      word('other-b', 'To construct a shelter', { part_of_speech: 'verb' }),
    ]
    const question = generateQuiz(rows, 'all', seededRandom(9)).questions.find(
      (item) => item.target.id === 'target',
    )!
    expect(question).toBeTruthy()
    const incorrect = question.options.filter(
      (_, index) => index !== question.correctIndex,
    )
    expect(incorrect).toEqual(
      expect.arrayContaining([
        'An orbital vehicle',
        'A launch facility',
        'A tiny insect',
      ]),
    )
  })
  it('rejects equivalent meanings after normalization, articles, synonym aliases and split definitions', () => {
    expect(equivalentMeanings('  A FAST vehicle! ', 'a quick vehicle')).toBe(
      true,
    )
    expect(equivalentMeanings('happy; joyful', 'glad')).toBe(true)
    expect(
      equivalentMeanings('someone who teaches', 'a person that teaches'),
    ).toBe(true)
    expect(equivalentMeanings('A café', 'a cafe\u0301')).toBe(true)
    const rows = [
      word('a', 'A quick vehicle'),
      word('b', 'a FAST vehicle'),
      word('c', 'the quick vehicle!'),
      word('d', 'A quick vehicle'),
    ]
    expect(generateQuiz(rows, 'all', seededRandom(2)).questions).toEqual([])
  })
  it('excludes declared synonyms in both directions and transitively, plus their alternative meanings', () => {
    const rows = [
      ...vocabulary(8),
      word('rapid', 'Moving at speed', { synonyms: 'fleet' }),
      word('fleet', 'An agile movement', { synonyms: 'swift' }),
      word('swift', 'Without delay'),
    ]
    const result = generateQuiz(rows, 'all', seededRandom(16))
    const related = new Set([
      'Moving at speed',
      'An agile movement',
      'Without delay',
    ])
    for (const question of result.questions.filter((item) =>
      ['rapid', 'fleet', 'swift'].includes(item.target.word),
    )) {
      question.options.forEach((option, index) => {
        if (index !== question.correctIndex)
          expect(related.has(option)).toBe(false)
      })
    }
  })
  it('does not use equivalent translations or synonym terms as competing distractors', () => {
    const rows = [
      word('target', 'A celestial body'),
      word('one', 'An airborne object', { vietnamese_meaning: 'vật thể' }),
      word('two', 'An object in flight', { vietnamese_meaning: ' VẬT THỂ ' }),
      ...vocabulary(6),
    ]
    const question = generateQuiz(rows, 'all', seededRandom(32)).questions.find(
      (item) => item.target.id === 'target',
    )!
    expect(
      question.options.includes('An airborne object') &&
        question.options.includes('An object in flight'),
    ).toBe(false)
  })
  it('skips malformed records and rejects invalid size/random inputs', () => {
    const rows = vocabulary(5)
    expect(
      generateQuiz([...rows, { ...rows[0]!, word: '' }], 10, seededRandom(1))
        .eligibleCount,
    ).toBe(5)
    expect(() => generateQuiz(rows, 5 as 10)).toThrow('Choose')
    expect(() => generateQuiz(rows, 10, () => 1)).toThrow('Random source')
  })
})
