export const fields = {
  word: { label: 'Word', limit: 200 },
  english_meaning: { label: 'English meaning', limit: 2000 },
  vietnamese_meaning: { label: 'Vietnamese meaning', limit: 2000 },
  part_of_speech: { label: 'Part of speech', limit: 200 },
  synonyms: { label: 'Synonyms', limit: 2000 },
  antonyms: { label: 'Antonyms', limit: 2000 },
  example_sentence: { label: 'Example sentence', limit: 5000 },
  note: { label: 'Note', limit: 5000 },
} as const
export type Field = keyof typeof fields
export const fieldNames = Object.keys(fields) as Field[]
export type VocabularyInput = Record<Field, string>
export interface Vocabulary extends VocabularyInput {
  id: string
  created_at: string
  updated_at: string
}
export const emptyInput: VocabularyInput = {
  word: '',
  english_meaning: '',
  vietnamese_meaning: '',
  part_of_speech: '',
  synonyms: '',
  antonyms: '',
  example_sentence: '',
  note: '',
}
export class VocabularyError extends Error {}
export function wordKey(word: string): string {
  return word.normalize('NFC').trim().toLowerCase()
}
export function duplicateKey(input: VocabularyInput): string {
  return JSON.stringify(
    [
      input.word,
      input.part_of_speech,
      input.english_meaning,
      input.vietnamese_meaning,
    ].map((value) => value.normalize('NFC').trim().toLowerCase()),
  )
}
export class ValidationError extends VocabularyError {
  readonly errors: Partial<Record<Field, string>>
  constructor(errors: Partial<Record<Field, string>>) {
    super(Object.values(errors).join(' '))
    this.errors = errors
  }
}
export function validate(input: VocabularyInput): VocabularyInput {
  const result = { ...emptyInput }
  const errors: Partial<Record<Field, string>> = {}
  for (const key of fieldNames) {
    if (typeof input[key] !== 'string') {
      errors[key] = `${fields[key].label} must be text.`
      continue
    }
    result[key] = input[key].normalize('NFC').trim()
    if (result[key].length > fields[key].limit)
      errors[key] =
        `${fields[key].label} must be at most ${fields[key].limit} characters.`
  }
  if (!result.word) errors.word = 'Word is required.'
  if (!result.english_meaning && !result.vietnamese_meaning)
    errors.english_meaning = 'Enter at least one English or Vietnamese meaning.'
  if (Object.keys(errors).length) throw new ValidationError(errors)
  return result
}
export function queryVocabulary(
  rows: Vocabulary[],
  search: string,
  part: string,
  sort: keyof Vocabulary,
  direction: 'asc' | 'desc',
) {
  const query = search.normalize('NFC').trim().toLowerCase()
  return rows
    .filter(
      (row) =>
        (!part || row.part_of_speech === part) &&
        fieldNames.some((key) => row[key].toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        (a[sort].localeCompare(b[sort]) || a.id.localeCompare(b.id)) *
        (direction === 'asc' ? 1 : -1),
    )
}
