import {
  duplicateKey,
  fieldNames,
  validate,
  VocabularyError,
  type Vocabulary,
  type VocabularyInput,
} from './model'

export const MAX_IMPORT_ROWS = 5000
export type DuplicatePolicy = 'skip' | 'replace' | 'keep'
export interface ImportWrite {
  original: Vocabulary | null
  input: VocabularyInput
}
export interface ImportPlan {
  writes: ImportWrite[]
  duplicates: number
  skipped: number
}
export function planImport(
  inputs: VocabularyInput[],
  existing: Vocabulary[],
  policy: DuplicatePolicy,
): ImportPlan {
  if (!['skip', 'replace', 'keep'].includes(policy))
    throw new VocabularyError('Choose a duplicate policy.')
  if (inputs.length > MAX_IMPORT_ROWS)
    throw new VocabularyError(`Import is limited to ${MAX_IMPORT_ROWS} rows.`)
  const buckets = new Map<string, ImportWrite[]>()
  for (const original of existing) {
    const key = duplicateKey(original)
    const bucket = buckets.get(key) ?? []
    bucket.push({ original, input: original })
    buckets.set(key, bucket)
  }
  const writes = new Set<ImportWrite>()
  let duplicates = 0,
    skipped = 0
  for (const raw of inputs) {
    const input = validate(raw)
    const key = duplicateKey(input)
    const matches = buckets.get(key) ?? []
    if (matches.length) {
      duplicates++
      if (policy === 'skip') {
        skipped++
        continue
      }
      if (policy === 'replace') {
        for (const match of matches) {
          match.input = input
          writes.add(match)
        }
        continue
      }
    }
    const write = { original: null, input }
    writes.add(write)
    matches.push(write)
    buckets.set(key, matches)
  }
  return { writes: [...writes], duplicates, skipped }
}
export function snapshotKey(rows: Vocabulary[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => [
        row.id,
        row.created_at,
        row.updated_at,
        ...fieldNames.map((key) => row[key]),
      ]),
  )
}
