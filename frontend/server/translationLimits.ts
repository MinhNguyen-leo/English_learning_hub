import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TranslationUsage } from '../src/features/translate/usage.ts'

const dayLength = 86400000
const bangkokOffset = 7 * 3600000
export const usageCookie = 'translate-device'
export function positiveSetting(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Translation limits must be positive integers.')
  return number
}

export class TranslationLimits {
  private db: DatabaseSync
  private secret: string
  private daily: number
  private globalDaily: number
  private ipDaily: number
  private cooldown: number
  private now: () => number
  constructor(
    path: string,
    env: Record<string, string | undefined> = {},
    now: () => number = Date.now,
  ) {
    this.now = now
    this.daily = positiveSetting(env.TRANSLATE_DAILY_LIMIT, 20)
    this.globalDaily = positiveSetting(env.TRANSLATE_GLOBAL_DAILY_LIMIT, 1000)
    this.ipDaily = positiveSetting(env.TRANSLATE_IP_DAILY_LIMIT, 100)
    this.cooldown = positiveSetting(env.TRANSLATE_COOLDOWN_SECONDS, 10) * 1000
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path, { timeout: 5000 })
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, day INTEGER NOT NULL, count INTEGER NOT NULL, last INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    this.db
      .prepare('INSERT OR IGNORE INTO secrets VALUES (?, ?)')
      .run('cookie', randomBytes(32).toString('hex'))
    this.secret = String(
      this.db.prepare('SELECT value FROM secrets WHERE key = ?').get('cookie')!
        .value,
    )
  }
  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('hex')
  }
  device(cookie: string | undefined) {
    const value = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${usageCookie}=`))
      ?.slice(usageCookie.length + 1)
    if (value && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) {
      const [id, signature] = value.split('.') as [string, string]
      if (timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(id))))
        return { id, cookie: null }
    }
    const id = randomUUID()
    return {
      id,
      cookie: `${usageCookie}=${id}.${this.sign(id)}; Path=/api/translate; HttpOnly; SameSite=Strict; Max-Age=31536000`,
    }
  }
  private keys(id: string, ip: string) {
    return [`device:${this.sign(id)}`, `ip:${this.sign(ip)}`, 'global']
  }
  private status(id: string, ip: string): TranslationUsage {
    const now = this.now()
    const day = Math.floor((now + bangkokOffset) / dayLength)
    const resetAt = (day + 1) * dayLength - bangkokOffset
    const rows = this.keys(id, ip).map((key) =>
      this.db
        .prepare('SELECT day, count, last FROM counters WHERE key = ?')
        .get(key),
    )
    const counts = rows.map((row) =>
      Number(row?.day) === day ? Number(row?.count) : 0,
    )
    const remaining = Math.max(
      0,
      Math.min(
        this.daily - counts[0]!,
        this.ipDaily - counts[1]!,
        this.globalDaily - counts[2]!,
      ),
    )
    const nextAt =
      Math.max(Number(rows[0]?.last ?? 0), Number(rows[1]?.last ?? 0)) +
      this.cooldown
    return {
      limit: this.daily,
      remaining,
      resetAt,
      retryAt:
        remaining === 0 ? Math.max(resetAt, nextAt) : Math.max(now, nextAt),
      serverNow: now,
    }
  }
  get(id: string, ip: string) {
    return this.status(id, ip)
  }
  consume(id: string, ip: string) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const before = this.status(id, ip)
      if (!before.remaining || before.retryAt > before.serverNow) {
        this.db.exec('COMMIT')
        return { allowed: false, usage: before }
      }
      const day = Math.floor((before.serverNow + bangkokOffset) / dayLength)
      for (const key of this.keys(id, ip)) {
        this.db
          .prepare(
            `INSERT INTO counters VALUES (?, ?, 1, ?)
          ON CONFLICT(key) DO UPDATE SET count = CASE WHEN day = excluded.day THEN count + 1 ELSE 1 END, day = excluded.day, last = excluded.last`,
          )
          .run(key, day, before.serverNow)
      }
      const usage = this.status(id, ip)
      this.db.exec('COMMIT')
      return { allowed: true, usage }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  close() {
    this.db.close()
  }
}
