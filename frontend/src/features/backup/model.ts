import {
  fields,
  fieldNames,
  validate,
  type Vocabulary,
} from '../vocabulary/model'
import { isStudySession } from '../flashcards/session'
import { isQuizSession } from '../quiz/session'
import type { SavedSession } from '../flashcards/progressRepository'
import type { SavedQuiz } from '../quiz/progressRepository'
import type { AppSettings } from '../../db/ApplicationDatabase'

export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024
export const MAX_RECORDS = 100_000
export interface BackupData {
  vocabulary: Vocabulary[]
  flashcardSessions: SavedSession[]
  quizSessions: SavedQuiz[]
  settings: AppSettings[]
}
export interface FullBackup {
  application: 'english-learning-hub'
  formatVersion: 1
  exportedAt: string
  data: BackupData
}
export class BackupError extends Error {}
function fail(path: string): never {
  throw new BackupError(`Invalid backup: ${path}. Nothing was restored.`)
}
function object(
  value: unknown,
  path: string,
  keys: string[],
  optionalKeys: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path)
  const row = value as Record<string, unknown>
  if (
    Object.keys(row).some(
      (key) => !keys.includes(key) && !optionalKeys.includes(key),
    ) ||
    !keys.every((key) => Object.hasOwn(row, key))
  )
    fail(`${path} has missing or unknown fields`)
  return row
}
function identifier(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    fail(path)
}
function timestamp(value: unknown, path: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail(path)
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS)
    fail(`${path} must be an array of at most ${MAX_RECORDS} records`)
  return value
}
function vocabulary(value: unknown, path: string) {
  const row = object(value, path, [
    'id',
    ...fieldNames,
    'created_at',
    'updated_at',
  ])
  identifier(row.id, `${path}.id`)
  if (
    typeof row.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      row.id,
    )
  )
    fail(`${path}.id must be a UUID`)
  timestamp(row.created_at, `${path}.created_at`)
  timestamp(row.updated_at, `${path}.updated_at`)
  if (Date.parse(row.updated_at) < Date.parse(row.created_at))
    fail(`${path}.updated_at precedes created_at`)
  for (const key of fieldNames)
    if (typeof row[key] !== 'string' || row[key].length > fields[key].limit)
      fail(`${path}.${key}`)
  try {
    validate(row as unknown as Vocabulary)
  } catch {
    fail(`${path} has invalid vocabulary fields`)
  }
}
function unique(rows: unknown[], path: string) {
  const ids = rows.map((row) => (row as Record<string, unknown>).id)
  if (new Set(ids).size !== ids.length) fail(`${path} contains repeated IDs`)
}
export function validateData(value: unknown): asserts value is BackupData {
  const data = object(value, 'data', [
    'vocabulary',
    'flashcardSessions',
    'quizSessions',
    'settings',
  ])
  const words = array(data.vocabulary, 'vocabulary')
  words.forEach((row, i) => vocabulary(row, `vocabulary[${i}]`))
  unique(words, 'vocabulary')
  for (const kind of ['flashcardSessions', 'quizSessions'] as const) {
    const rows = array(data[kind], kind)
    if (rows.length > 1) fail(`${kind} only supports the active session`)
    rows.forEach((value, i) => {
      const path = `${kind}[${i}]`
      const row = object(value, path, ['id', 'revision', 'session'])
      if (
        row.id !== 'active' ||
        typeof row.revision !== 'number' ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1
      )
        fail(path)
      const flashcards = kind === 'flashcardSessions'
      const session = object(
        row.session,
        `${path}.session`,
        flashcards
          ? ['schemaVersion', 'id', 'cards', 'index', 'flipped', 'reviews']
          : [
              'schemaVersion',
              'id',
              'requestedSize',
              'eligibleCount',
              'questions',
              'answers',
              'index',
              'finished',
            ],
      )
      identifier(session.id, `${path}.session.id`)
      if (flashcards) {
        array(session.cards, `${path}.cards`).forEach((card, j) =>
          vocabulary(card, `${path}.cards[${j}]`),
        )
        array(session.reviews, `${path}.reviews`).forEach((review) =>
          object(review, `${path}.reviews`, ['id', 'status']),
        )
        if (!isStudySession(session))
          fail(`${path} has invalid flashcard progress or relationships`)
      } else {
        const questions = array(session.questions, `${path}.questions`)
        questions.forEach((question, j) => {
          const q = object(
            question,
            `${path}.questions[${j}]`,
            ['target', 'options', 'correctIndex'],
            ['translations'],
          )
          vocabulary(q.target, `${path}.questions[${j}].target`)
        })
        unique(
          questions.map(
            (question) => (question as Record<string, unknown>).target,
          ),
          `${path}.questions targets`,
        )
        array(session.answers, `${path}.answers`)
        if (!isQuizSession(session))
          fail(`${path} has invalid quiz answers or relationships`)
      }
    })
  }
  const settings = array(data.settings, 'settings')
  if (settings.length > 1) fail('settings only supports one preferences record')
  settings.forEach((value) => {
    const row = object(value, 'settings', ['id', 'flashcardSize', 'quizSize'])
    if (
      row.id !== 'preferences' ||
      ![20, 50, 'all'].includes(row.flashcardSize as number | string) ||
      ![10, 20, 50, 'all'].includes(row.quizSize as number | string)
    )
      fail('settings')
  })
}
export function validateBackup(value: unknown): asserts value is FullBackup {
  const backup = object(value, 'root', [
    'application',
    'formatVersion',
    'exportedAt',
    'data',
  ])
  if (backup.application !== 'english-learning-hub')
    fail('application identifier')
  if (backup.formatVersion !== BACKUP_VERSION)
    throw new BackupError(
      'Unsupported backup format version. Nothing was restored.',
    )
  timestamp(backup.exportedAt, 'exportedAt')
  validateData(backup.data)
}
export function parseBackup(text: string): FullBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new BackupError('Backup files must be 32 MiB or smaller.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new BackupError('Malformed JSON backup. Nothing was restored.')
  }
  validateBackup(value)
  return value
}
export async function readBackupFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.json'))
    throw new BackupError('Choose a .json full backup file.')
  if (file.size > MAX_BACKUP_BYTES)
    throw new BackupError('Backup files must be 32 MiB or smaller.')
  return parseBackup(await file.text())
}
export function createBackup(data: BackupData): FullBackup {
  const backup: FullBackup = {
    application: 'english-learning-hub',
    formatVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
  // Use the same validation and size bounds for export and restore.
  return parseBackup(JSON.stringify(backup))
}
export type RestoreMode = 'merge' | 'replace'
export function counts(data: BackupData) {
  return {
    vocabulary: data.vocabulary.length,
    flashcardSessions: data.flashcardSessions.length,
    quizSessions: data.quizSessions.length,
    settings: data.settings.length,
  }
}
export function conflicts(incoming: BackupData, existing: BackupData) {
  return Object.fromEntries(
    (Object.keys(existing) as (keyof BackupData)[]).map((key) => {
      const byId = new Map(
        existing[key].map((row) => [row.id, JSON.stringify(row)]),
      )
      return [
        key,
        incoming[key].filter(
          (row) => byId.has(row.id) && byId.get(row.id) !== JSON.stringify(row),
        ).length,
      ]
    }),
  ) as Record<keyof BackupData, number>
}
export function mergeData(
  existing: BackupData,
  incoming: BackupData,
): BackupData {
  function merge<T extends { id: string }>(current: T[], added: T[]) {
    const ids = new Set(current.map((row) => row.id))
    return [...current, ...added.filter((row) => !ids.has(row.id))]
  }
  return {
    vocabulary: merge(existing.vocabulary, incoming.vocabulary),
    flashcardSessions: merge(
      existing.flashcardSessions,
      incoming.flashcardSessions,
    ),
    quizSessions: merge(existing.quizSessions, incoming.quizSessions),
    settings: merge(existing.settings, incoming.settings),
  }
}
