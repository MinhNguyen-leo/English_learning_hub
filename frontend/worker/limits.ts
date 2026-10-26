import { DurableObject } from 'cloudflare:workers'
import type { TranslationUsage } from '../src/features/translate/usage.ts'
import { positiveSetting, type WorkerEnv } from './env.ts'

const dayLength = 86400000
const offset = 7 * 3600000
const cookieName = 'translate-device'
const encoder = new TextEncoder()
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

export class TranslationLimitsObject extends DurableObject<WorkerEnv> {
  private readonly signingKey: Promise<CryptoKey>
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    const sql = ctx.storage.sql
    sql.exec(
      'CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, day INTEGER NOT NULL, count INTEGER NOT NULL, last INTEGER NOT NULL)',
    )
    sql.exec(
      'CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    )
    sql.exec(
      'INSERT OR IGNORE INTO secrets VALUES (?, ?)',
      'cookie',
      hex(crypto.getRandomValues(new Uint8Array(32)).buffer),
    )
    const secret = sql
      .exec<{ value: string }>(
        'SELECT value FROM secrets WHERE key = ?',
        'cookie',
      )
      .one().value
    this.signingKey = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  private async sign(value: string) {
    return hex(
      await crypto.subtle.sign(
        'HMAC',
        await this.signingKey,
        encoder.encode(value),
      ),
    )
  }
  private async device(cookie: string) {
    const value = cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
    if (value && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) {
      const [id, signature] = value.split('.') as [string, string]
      const bytes = Uint8Array.from(signature.match(/../g)!, (part) =>
        parseInt(part, 16),
      )
      if (
        await crypto.subtle.verify(
          'HMAC',
          await this.signingKey,
          bytes,
          encoder.encode(id),
        )
      )
        return { id, cookie: null }
    }
    const id = crypto.randomUUID()
    return {
      id,
      cookie: `${cookieName}=${id}.${await this.sign(id)}; Path=/api/translate; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
    }
  }
  private status(keys: string[], now: number): TranslationUsage {
    const day = Math.floor((now + offset) / dayLength)
    const resetAt = (day + 1) * dayLength - offset
    const limits = [
      positiveSetting(this.env.TRANSLATE_DAILY_LIMIT, 20),
      positiveSetting(this.env.TRANSLATE_IP_DAILY_LIMIT, 100),
      positiveSetting(this.env.TRANSLATE_GLOBAL_DAILY_LIMIT, 1000),
    ]
    const rows = keys.map(
      (key) =>
        this.ctx.storage.sql
          .exec<{ day: number; count: number; last: number }>(
            'SELECT day, count, last FROM counters WHERE key = ?',
            key,
          )
          .toArray()[0],
    )
    const remaining = Math.max(
      0,
      Math.min(
        ...limits.map(
          (limit, index) =>
            limit - (rows[index]?.day === day ? rows[index]!.count : 0),
        ),
      ),
    )
    const nextAt =
      Math.max(rows[0]?.last ?? 0, rows[1]?.last ?? 0) +
      positiveSetting(this.env.TRANSLATE_COOLDOWN_SECONDS, 10) * 1000
    return {
      limit: limits[0]!,
      remaining,
      resetAt,
      retryAt:
        remaining === 0 ? Math.max(resetAt, nextAt) : Math.max(now, nextAt),
      serverNow: now,
    }
  }
  async fetch(request: Request) {
    const input = (await request.json()) as {
      cookie: string
      ip: string
      consume: boolean
    }
    const device = await this.device(input.cookie)
    const keys = [
      `device:${await this.sign(device.id)}`,
      `ip:${await this.sign(input.ip)}`,
      'global',
    ]
    // All callers share one object; no await inside admission, so increments are atomic.
    const result = this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      const before = this.status(keys, now)
      if (!input.consume || !before.remaining || before.retryAt > now)
        return { allowed: false, usage: before, cookie: device.cookie }
      const day = Math.floor((now + offset) / dayLength)
      for (const key of keys) {
        this.ctx.storage.sql.exec(
          `INSERT INTO counters VALUES (?, ?, 1, ?)
          ON CONFLICT(key) DO UPDATE SET count = CASE WHEN day = excluded.day THEN count + 1 ELSE 1 END, day = excluded.day, last = excluded.last`,
          key,
          day,
          now,
        )
      }
      return {
        allowed: true,
        usage: this.status(keys, now),
        cookie: device.cookie,
      }
    })
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + dayLength)
    return Response.json(result)
  }
  async alarm() {
    // Retain the previous day for cooldowns crossing midnight, discard older metadata.
    const day = Math.floor((Date.now() + offset) / dayLength)
    this.ctx.storage.sql.exec('DELETE FROM counters WHERE day < ?', day - 1)
    const count = this.ctx.storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) AS count FROM counters')
      .one().count
    if (count) await this.ctx.storage.setAlarm(Date.now() + dayLength)
  }
}
