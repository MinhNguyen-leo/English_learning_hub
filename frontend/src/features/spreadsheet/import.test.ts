import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  emptyInput,
  duplicateKey,
  type VocabularyInput,
} from '../vocabulary/model'
import {
  IndexedDBVocabularyRepository,
  VocabularyDatabase,
} from '../vocabulary/repository'
import { planImport } from '../vocabulary/importPlan'

let db: VocabularyDatabase
let repo: IndexedDBVocabularyRepository
const input = {
  ...emptyInput,
  word: 'bank',
  part_of_speech: 'noun',
  english_meaning: 'a financial institution',
  note: 'original',
}
beforeEach(() => {
  db = new VocabularyDatabase(`test-import-${crypto.randomUUID()}`)
  repo = new IndexedDBVocabularyRepository(db)
})
afterEach(async () => {
  await db.delete()
})
it('detects normalized word, part of speech and both meanings; distinct parts and meanings remain separate', () => {
  expect(duplicateKey(input)).toBe(
    duplicateKey({
      ...input,
      word: ' BANK ',
      part_of_speech: ' NOUN ',
      english_meaning: ' A Financial Institution ',
    }),
  )
  expect(duplicateKey({ ...input, vietnamese_meaning: 'ắ' })).toBe(
    duplicateKey({ ...input, vietnamese_meaning: 'a\u0306\u0301' }),
  )
  expect(
    planImport(
      [
        input,
        { ...input, part_of_speech: 'verb' },
        { ...input, english_meaning: 'side of river' },
      ],
      [],
      'skip',
    ).writes,
  ).toHaveLength(3)
})
it('skips duplicates both in the file and existing library', async () => {
  await repo.create(input)
  const snapshot = await repo.list()
  const fresh = { ...input, word: 'hello' }
  const result = await repo.importEntries(
    [{ ...input, note: 'ignored' }, fresh, fresh],
    'skip',
    snapshot,
  )
  expect(result).toHaveLength(2)
  expect(result.find((row) => row.word === 'bank')?.note).toBe('original')
})
it('replaces matches preserving identity, with last valid file row winning', async () => {
  const original = await repo.create(input)
  const result = await repo.importEntries(
    [
      { ...input, note: 'first' },
      { ...input, note: 'last' },
    ],
    'replace',
    [original],
  )
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    id: original.id,
    created_at: original.created_at,
    note: 'last',
  })
  expect(result[0]!.updated_at > original.updated_at).toBe(true)
})
it('keeps duplicates and permits editing their optional fields', async () => {
  await repo.create(input)
  const result = await repo.importEntries(
    [input, input],
    'keep',
    await repo.list(),
  )
  expect(result).toHaveLength(3)
  expect(new Set(result.map((row) => row.id)).size).toBe(3)
  const row = result[0]!
  await expect(
    repo.update(row.id, { ...input, note: 'edited' }, row.updated_at),
  ).resolves.toMatchObject({ note: 'edited' })
})
it('replaces all deliberately kept matches without removing their identities', async () => {
  const kept = await repo.importEntries([input, input], 'keep', [])
  const result = await repo.importEntries(
    [{ ...input, note: '' }],
    'replace',
    kept,
  )
  expect(result.map((row) => row.id).sort()).toEqual(
    kept.map((row) => row.id).sort(),
  )
  expect(result.every((row) => row.note === '')).toBe(true)
})
it('replaces duplicates within a new file with the last row', async () => {
  const result = await repo.importEntries(
    [input, { ...input, note: 'last' }],
    'replace',
    [],
  )
  expect(result).toHaveLength(1)
  expect(result[0]?.note).toBe('last')
})
it('rejects stale preview snapshots without overwriting another tab', async () => {
  const snapshot = await repo.list()
  const row = await repo.create(input)
  await expect(
    repo.importEntries([{ ...input, note: 'stale' }], 'replace', snapshot),
  ).rejects.toThrow('changed since preview')
  expect(await repo.list()).toEqual([row])
})
it('rolls back an entire import on a later transaction failure and allows retry', async () => {
  const original = await repo.create(input)
  const fail = () => {
    throw new Error('quota exceeded')
  }
  db.vocabulary.hook('creating', fail)
  const batch = [
    { ...input, note: 'replacement' },
    { ...input, word: 'new' },
  ]
  await expect(
    repo.importEntries(batch, 'replace', [original]),
  ).rejects.toThrow('storage failed')
  expect(await repo.list()).toEqual([original])
  db.vocabulary.hook('creating').unsubscribe(fail)
  expect(await repo.importEntries(batch, 'replace', [original])).toHaveLength(2)
})
it('revalidates the entire batch and limits before writing', async () => {
  await expect(
    repo.importEntries([input, emptyInput], 'keep', []),
  ).rejects.toThrow('Word is required')
  expect(await repo.list()).toEqual([])
  await expect(
    repo.importEntries(
      Array.from({ length: 5001 }, () => input),
      'keep',
      [],
    ),
  ).rejects.toThrow('5000')
  expect(await repo.list()).toEqual([])
})
it('persists imported Vietnamese content after reopening the database', async () => {
  const vietnamese: VocabularyInput = {
    ...input,
    word: 'hello',
    vietnamese_meaning: 'xin chào',
    note: 'Học tiếng Anh mỗi ngày',
  }
  const imported = await repo.importEntries([vietnamese], 'keep', [])
  db.close()
  const reopened = new VocabularyDatabase(db.name)
  try {
    expect(await new IndexedDBVocabularyRepository(reopened).list()).toEqual(
      imported,
    )
  } finally {
    reopened.close()
  }
})
