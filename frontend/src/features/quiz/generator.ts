import { validate, type Vocabulary } from '../vocabulary/model'
import { normalizeStudyText, prioritizeMistakes } from '../../lib/study'

export type QuizSize = 10 | 20 | 50 | 'all'
export interface QuizQuestion {
  target: Vocabulary
  options: [string, string, string, string]
  translations?: [string, string, string, string]
  correctIndex: number
}
export interface GeneratedQuiz {
  questions: QuizQuestion[]
  eligibleCount: number
}
export type Random = () => number
export function shuffle<T>(source: readonly T[], random: Random): T[] {
  const result = [...source]
  for (let i = result.length - 1; i > 0; i--) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('Random source must return a value in [0, 1).')
    const j = Math.floor(value * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
export const normalize = normalizeStudyText
const synonymGroups = [
  ['happy', 'glad', 'joyful', 'cheerful'],
  ['sad', 'unhappy', 'sorrowful'],
  ['fast', 'quick', 'rapid', 'speedy'],
  ['big', 'large', 'huge'],
  ['small', 'little', 'tiny'],
  ['buy', 'purchase'],
  ['begin', 'start', 'commence'],
  ['end', 'finish', 'complete'],
  ['clever', 'smart', 'intelligent'],
  ['quiet', 'silent'],
  ['angry', 'mad', 'furious'],
  ['child', 'kid', 'children'],
  ['speak', 'talk'],
  ['helpful', 'useful'],
  ['beautiful', 'pretty'],
]
const aliases = new Map(
  synonymGroups.flatMap((group) =>
    group.map((word) => [word, group[0]!] as const),
  ),
)
const stopwords = new Set([
  'a',
  'an',
  'the',
  'to',
  'be',
  'being',
  'is',
  'are',
  'of',
  'that',
  'who',
  'which',
  'very',
])
function meaningTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/\b(someone|somebody|one)\b/g, 'person')
      .split(' ')
      .filter((token) => token && !stopwords.has(token))
      .map((token) => aliases.get(token) ?? token),
  )
}
function overlaps(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false
  const intersection = [...a].filter((token) => b.has(token)).length
  return (
    intersection === Math.min(a.size, b.size) ||
    intersection / (a.size + b.size - intersection) >= 0.65
  )
}
function alternatives(meaning: string): Set<string>[] {
  return [meaning, ...meaning.split(/[;,/|\n]+|\s+or\s+/i)]
    .map(meaningTokens)
    .filter((tokens) => tokens.size > 0)
}
export function equivalentMeanings(a: string, b: string): boolean {
  return (
    normalize(a) === normalize(b) ||
    alternatives(a).some((left) =>
      alternatives(b).some((right) => overlaps(left, right)),
    )
  )
}
// Translation alternatives are exact normalized matches. Applying the English
// token-overlap heuristic here can collapse distinct numbered/qualified meanings.
function overlappingTranslations(a: string, b: string): boolean {
  const alternatives = (value: string) =>
    value
      .split(/[;,/|\n]+/)
      .map(normalize)
      .filter(Boolean)
  const left = new Set(alternatives(a))
  return alternatives(b).some((value) => left.has(value))
}
function part(value: string): string {
  const key = normalize(value)
  return (
    (
      {
        n: 'noun',
        v: 'verb',
        adj: 'adjective',
        adv: 'adverb',
        pron: 'pronoun',
        prep: 'preposition',
        conj: 'conjunction',
        interj: 'interjection',
      } as Record<string, string>
    )[key] ?? key
  )
}
function tags(row: Vocabulary): Set<string> {
  return new Set(
    [...row.note.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) =>
      normalize(match[1]!),
    ),
  )
}
interface Entry {
  row: Vocabulary
  word: string
  part: string
  tags: Set<string>
  meanings: Set<string>[]
  family: string
  translation: string
}
export function generateQuiz(
  rows: readonly Vocabulary[],
  size: QuizSize,
  random: Random = Math.random,
  mistakes: ReadonlySet<string> = new Set(),
): GeneratedQuiz {
  if (![10, 20, 50, 'all'].includes(size))
    throw new Error('Choose 10, 20, 50 or all eligible questions.')
  const records: Vocabulary[] = []
  const ids = new Set<string>()
  for (const row of rows) {
    try {
      const input = validate(row)
      if (
        typeof row.id === 'string' &&
        row.id &&
        normalize(input.word) &&
        !ids.has(row.id)
      ) {
        records.push({ ...row, ...input })
        ids.add(row.id)
      }
    } catch {
      /* Malformed records never become quiz content. */
    }
  }
  // Union synonym terms in both directions, including transitive declarations.
  const parents = new Map<string, string>()
  function root(term: string): string {
    const key = normalize(term)
    if (!parents.has(key)) parents.set(key, key)
    let current = key
    while (parents.get(current) !== current) current = parents.get(current)!
    let next = key
    while (parents.get(next) !== current) {
      const parent = parents.get(next)!
      parents.set(next, current)
      next = parent
    }
    return current
  }
  function union(a: string, b: string) {
    parents.set(root(a), root(b))
  }
  synonymGroups.forEach((group) =>
    group.slice(1).forEach((word) => union(group[0]!, word)),
  )
  records.forEach((row) =>
    row.synonyms
      .split(/[;,/|\n]+/)
      .filter((value) => value.trim())
      .forEach((value) => union(row.word, value)),
  )
  const all = records.map((row) => ({
    row,
    word: normalize(row.word),
    part: part(row.part_of_speech),
    tags: tags(row),
    meanings: alternatives(row.english_meaning),
    family: root(row.word),
    // Keep separators until individual alternatives have been compared.
    translation: row.vietnamese_meaning.trim(),
  }))
  const candidates = all.filter(
    (entry) => entry.meanings.length && entry.row.english_meaning.trim(),
  )
  const groups = new Map<string, Entry[]>()
  for (const entry of all) {
    const key = entry.family
    const bucket = groups.get(key) ?? []
    bucket.push(entry)
    groups.set(key, bucket)
  }
  const usedTargets = new Set<string>()
  const questions: QuizQuestion[] = []
  let eligibleCount = 0
  // Target order and distractor/answer positions all use the injected random source.
  for (const target of prioritizeMistakes(
    shuffle(candidates, random),
    (entry) => entry.word,
    mistakes,
  )) {
    if (usedTargets.has(target.word)) continue
    const family = groups.get(target.family) ?? [target]
    const protectedMeanings = family.flatMap((entry) => entry.meanings)
    const declared = family.flatMap((entry) =>
      entry.row.synonyms
        .split(/[;,/|\n]+/)
        .filter(Boolean)
        .map(meaningTokens),
    )
    const safe: Entry[][] = [[], [], [], []]
    const excludedMeanings = [...protectedMeanings, ...declared]
    const excludedTranslations = new Set(
      family.map((entry) => entry.translation).filter(Boolean),
    )
    const targetTags = [...target.tags]
    for (const candidate of candidates) {
      if (candidate.family === target.family) continue
      const samePart = Boolean(target.part) && target.part === candidate.part
      const relatedTag = targetTags.some((tag) => candidate.tags.has(tag))
      safe[samePart ? (relatedTag ? 0 : 1) : relatedTag ? 2 : 3]!.push(
        candidate,
      )
    }
    const distractors: Entry[] = []
    for (const tier of safe) {
      for (const candidate of shuffle(tier, random)) {
        if (
          (Boolean(candidate.translation) &&
            [...excludedTranslations].some((translation) =>
              overlappingTranslations(translation, candidate.translation),
            )) ||
          candidate.meanings.some((right) =>
            excludedMeanings.some((left) => overlaps(left, right)),
          )
        )
          continue
        if (
          distractors.some(
            (selected) =>
              selected.family === candidate.family ||
              (Boolean(candidate.translation) &&
                Boolean(selected.translation) &&
                overlappingTranslations(
                  selected.translation,
                  candidate.translation,
                )) ||
              selected.meanings.some((left) =>
                candidate.meanings.some((right) => overlaps(left, right)),
              ),
          )
        )
          continue
        distractors.push(candidate)
        if (distractors.length === 3) break
      }
      if (distractors.length === 3) break
    }
    if (distractors.length !== 3) continue
    usedTargets.add(target.word)
    eligibleCount++
    if (size !== 'all' && questions.length >= size) continue
    const answers = shuffle(
      [
        {
          text: target.row.english_meaning,
          translation: target.row.vietnamese_meaning,
          correct: true,
        },
        ...distractors.map((entry) => ({
          text: entry.row.english_meaning,
          translation: entry.row.vietnamese_meaning,
          correct: false,
        })),
      ],
      random,
    )
    questions.push({
      target: { ...target.row },
      options: answers.map((answer) => answer.text) as QuizQuestion['options'],
      translations: answers.map((answer) => answer.translation) as NonNullable<
        QuizQuestion['translations']
      >,
      correctIndex: answers.findIndex((answer) => answer.correct),
    })
  }
  return { questions, eligibleCount }
}
