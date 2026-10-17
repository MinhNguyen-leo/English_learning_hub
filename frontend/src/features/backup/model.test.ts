import { describe, expect, it } from 'vitest'
import { fixture } from './testSupport'
import {
  MAX_BACKUP_BYTES,
  MAX_RECORDS,
  parseBackup,
  readBackupFile,
  validateBackup,
} from './model'

describe('full backup validation', () => {
  it('accepts legacy quizzes without translations and round trips new translation snapshots', () => {
    const backup = fixture()
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
    for (const question of backup.data.quizSessions[0]!.session.questions)
      delete question.translations
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
  })
  it.each([['short'], ['', '', '', 'x'.repeat(2001)], ['', '', '', 42]])(
    'rejects malformed translation snapshots %j',
    (...values) => {
      const backup = fixture()
      Object.assign(backup.data.quizSessions[0]!.session.questions[0]!, {
        translations: values,
      })
      expect(() => validateBackup(backup)).toThrow()
    },
  )
  it('round trips Unicode, IDs, timestamps, snapshot relationships and preferences without normalization or execution', () => {
    const original = fixture()
    expect(parseBackup(JSON.stringify(original))).toEqual(original)
    expect(original.data.vocabulary[0]?.vietnamese_meaning).toBe(
      'giáo dục mầm non — Tiếng Việt',
    )
  })
  it.each(['{', 'null', '[]', '{}', '{"__proto__":{"polluted":true}}'])(
    'rejects malformed or invalid structure %s',
    (text) => {
      expect(() => parseBackup(text)).toThrow()
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
    },
  )
  it.each([
    [
      'unsupported version',
      (b: ReturnType<typeof fixture>) => Object.assign(b, { formatVersion: 2 }),
    ],
    [
      'wrong app',
      (b: ReturnType<typeof fixture>) =>
        Object.assign(b, { application: 'other-app' }),
    ],
    [
      'missing store',
      (b: ReturnType<typeof fixture>) =>
        Reflect.deleteProperty(b.data, 'settings'),
    ],
    [
      'unknown store',
      (b: ReturnType<typeof fixture>) => Object.assign(b.data, { cloud: [] }),
    ],
    [
      'bad export date',
      (b: ReturnType<typeof fixture>) => {
        b.exportedAt = 'yesterday'
      },
    ],
    [
      'invalid required field',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.word = ' '
      },
    ],
    [
      'invalid optional field',
      (b: ReturnType<typeof fixture>) =>
        Object.assign(b.data.vocabulary[0]!, { synonyms: null }),
    ],
    [
      'field too long',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.note = 'x'.repeat(5001)
      },
    ],
    [
      'missing meaning',
      (b: ReturnType<typeof fixture>) =>
        Object.assign(b.data.vocabulary[0]!, {
          english_meaning: '',
          vietnamese_meaning: '',
        }),
    ],
    [
      'empty id',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.id = ''
      },
    ],
    [
      'non-UUID vocabulary id',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.id = 'not-a-uuid'
      },
    ],
    [
      'duplicate id',
      (b: ReturnType<typeof fixture>) =>
        b.data.vocabulary.push(b.data.vocabulary[0]!),
    ],
    [
      'invalid timestamp',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.created_at = 'nope'
      },
    ],
    [
      'reverse timestamps',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary[0]!.created_at = '2027-01-01T00:00:00.000Z'
      },
    ],
    [
      'bad revision',
      (b: ReturnType<typeof fixture>) => {
        b.data.flashcardSessions[0]!.revision = 0
      },
    ],
    [
      'unsupported session',
      (b: ReturnType<typeof fixture>) =>
        Object.assign(b.data.flashcardSessions[0]!.session, {
          schemaVersion: 2,
        }),
    ],
    [
      'broken review reference',
      (b: ReturnType<typeof fixture>) => {
        b.data.flashcardSessions[0]!.session.reviews[0]!.id = 'unknown'
      },
    ],
    [
      'duplicate card id',
      (b: ReturnType<typeof fixture>) => {
        b.data.flashcardSessions[0]!.session.cards[1]!.id =
          b.data.flashcardSessions[0]!.session.cards[0]!.id
      },
    ],
    [
      'bad embedded vocabulary',
      (b: ReturnType<typeof fixture>) => {
        b.data.quizSessions[0]!.session.questions[0]!.target.created_at = 'bad'
      },
    ],
    [
      'invalid correct answer',
      (b: ReturnType<typeof fixture>) => {
        b.data.quizSessions[0]!.session.questions[0]!.correctIndex = 9
      },
    ],
    [
      'invalid submitted answer',
      (b: ReturnType<typeof fixture>) => {
        b.data.quizSessions[0]!.session.answers[0] = -1
      },
    ],
    [
      'invalid quiz index',
      (b: ReturnType<typeof fixture>) => {
        b.data.quizSessions[0]!.session.index = 999
      },
    ],
    [
      'duplicate quiz target id',
      (b: ReturnType<typeof fixture>) => {
        b.data.quizSessions[0]!.session.questions[1]!.target.id =
          b.data.quizSessions[0]!.session.questions[0]!.target.id
      },
    ],
    [
      'invalid setting',
      (b: ReturnType<typeof fixture>) =>
        Object.assign(b.data.settings[0]!, { quizSize: 999 }),
    ],
    [
      'oversized record list',
      (b: ReturnType<typeof fixture>) => {
        b.data.vocabulary = Array(MAX_RECORDS + 1).fill(b.data.vocabulary[0])
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const backup = fixture()
    mutate(backup)
    expect(() => validateBackup(backup)).toThrow()
  })
  it('checks file type and size before reading untrusted data', async () => {
    let read = false
    const file = {
      name: 'backup.json',
      size: MAX_BACKUP_BYTES + 1,
      text: async () => {
        read = true
        return '{}'
      },
    } as File
    await expect(readBackupFile(file)).rejects.toThrow('32 MiB')
    expect(read).toBe(false)
    await expect(
      readBackupFile({ ...file, name: 'backup.exe', size: 1 }),
    ).rejects.toThrow('.json')
  })
})
