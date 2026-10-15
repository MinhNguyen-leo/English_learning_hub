import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyInput,
  fields,
  fieldNames,
  queryVocabulary,
  validate,
} from './model'
import { IndexedDBVocabularyRepository, VocabularyDatabase } from './repository'
let db: VocabularyDatabase
let repo: IndexedDBVocabularyRepository
const input = {
  ...emptyInput,
  word: 'bank',
  english_meaning: 'financial institution',
}
beforeEach(() => {
  db = new VocabularyDatabase(`test-${crypto.randomUUID()}`)
  repo = new IndexedDBVocabularyRepository(db)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})
describe('guest repository', () => {
  it('creates, reads, updates and deletes committed entries', async () => {
    const created = await repo.create(input)
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await repo.list()).toEqual([created])
    const updated = await repo.update(
      created.id,
      { ...input, note: 'remember' },
      created.updated_at,
    )
    expect(updated.created_at).toBe(created.created_at)
    expect(updated.updated_at > created.updated_at).toBe(true)
    expect((await repo.list())[0]?.note).toBe('remember')
    await repo.delete(updated.id, updated.updated_at)
    expect(await repo.list()).toEqual([])
  })
  it('persists across closing and opening a new database instance', async () => {
    const row = await repo.create(input)
    db.close()
    const reopened = new VocabularyDatabase(db.name)
    try {
      expect(await new IndexedDBVocabularyRepository(reopened).list()).toEqual([
        row,
      ])
    } finally {
      reopened.close()
    }
  })
  it('allows multiple meanings but rejects identical normalized word/meaning pairs', async () => {
    await repo.create(input)
    await repo.create({ ...input, english_meaning: 'side of a river' })
    await expect(repo.create({ ...input, word: ' BANK ' })).rejects.toThrow(
      'already exists',
    )
    expect(await repo.list()).toHaveLength(2)
  })
  it('rejects stale edits and deletes without losing committed data', async () => {
    const row = await repo.create(input)
    const changed = await repo.update(
      row.id,
      { ...input, note: 'new' },
      row.updated_at,
    )
    await expect(repo.update(row.id, input, row.updated_at)).rejects.toThrow(
      'another tab',
    )
    await expect(repo.delete(row.id, row.updated_at)).rejects.toThrow(
      'another tab',
    )
    expect(await repo.list()).toEqual([changed])
  })
  it('rejects invalid writes without changing saved data', async () => {
    const row = await repo.create(input)
    await expect(
      repo.update(row.id, { ...input, word: ' ' }, row.updated_at),
    ).rejects.toThrow('Word is required')
    await expect(repo.create(emptyInput)).rejects.toThrow('Word is required')
    expect(await repo.list()).toEqual([row])
  })
  it('rolls back a failed write', async () => {
    const row = await repo.create(input)
    db.vocabulary.hook('updating', () => {
      throw new Error('transaction aborted')
    })
    await expect(
      repo.update(row.id, { ...input, note: 'lost?' }, row.updated_at),
    ).rejects.toThrow('storage failed')
    expect(await repo.list()).toEqual([row])
  })
  it('reports unavailable storage', async () => {
    vi.spyOn(db.vocabulary, 'toArray').mockRejectedValue(
      new DOMException('denied', 'SecurityError'),
    )
    await expect(repo.list()).rejects.toThrow('storage failed')
  })
  it('serializes duplicate creates atomically', async () => {
    const results = await Promise.allSettled([
      repo.create(input),
      repo.create(input),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
  })
})
describe('validation and queries', () => {
  it('requires a word and at least one meaning', () => {
    expect(() => validate(emptyInput)).toThrow('Word is required')
    expect(() => validate({ ...input, english_meaning: ' ' })).toThrow(
      'at least one',
    )
    expect(
      validate({
        ...emptyInput,
        word: ' hello ',
        vietnamese_meaning: ' xin ch�o ',
      }).vietnamese_meaning,
    ).toBe('xin ch�o')
  })
  it.each(fieldNames)('validates the length and type of %s', (key) => {
    expect(() =>
      validate({ ...input, [key]: 'x'.repeat(fields[key].limit + 1) }),
    ).toThrow('at most')
    expect(() =>
      validate({ ...input, [key]: 1 } as unknown as typeof input),
    ).toThrow()
  })
  it('searches all fields, filters and sorts without mutating records', async () => {
    const a = await repo.create({
      ...input,
      part_of_speech: 'noun',
      note: 'Money',
    })
    const b = await repo.create({
      ...input,
      word: 'act',
      part_of_speech: 'verb',
    })
    const rows = [a, b]
    expect(queryVocabulary(rows, 'MONEY', 'noun', 'word', 'asc')).toEqual([a])
    expect(queryVocabulary(rows, '', '', 'word', 'asc')).toEqual([b, a])
    expect(queryVocabulary(rows, '', '', 'word', 'desc')).toEqual([a, b])
    expect(rows).toEqual([a, b])
  })
})
