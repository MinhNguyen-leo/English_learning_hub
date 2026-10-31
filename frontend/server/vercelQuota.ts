import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Admission } from './vercelHandler.ts'
import { parseUsage } from '../src/features/translate/usage.ts'

const script = `
local now = tonumber(ARGV[1])
local reset = tonumber(ARGV[2])
local consume = ARGV[3] == '1'
local limits = {30, 100, 1000}
local remaining = 1000
for i = 1, 3 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  remaining = math.min(remaining, math.max(0, limits[i] - count))
end
local wait = math.max(0, redis.call('PTTL', KEYS[4]), redis.call('PTTL', KEYS[5]))
local allowed = consume and remaining > 0 and wait == 0
if allowed then
  for i = 1, 3 do
    redis.call('INCR', KEYS[i])
    redis.call('PEXPIRE', KEYS[i], reset - now + 86400000)
  end
  redis.call('SET', KEYS[4], '1', 'PX', 10000)
  redis.call('SET', KEYS[5], '1', 'PX', 10000)
  remaining = remaining - 1
  wait = 10000
end
local retry = now + wait
if remaining == 0 then retry = math.max(reset, retry) end
return {allowed and 1 or 0, remaining, reset, retry, now}
`

export async function admitTranslation(
  cookie: string,
  ip: string,
  consume: boolean,
): Promise<Admission> {
  const secret = process.env.TRANSLATE_QUOTA_SECRET
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL
  if (!secret || secret.length < 32 || !token || !rawUrl)
    throw new Error('Missing quota configuration')
  const url = new URL(rawUrl)
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.upstash.io') ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid quota endpoint')
  const sign = (value: string) =>
    createHmac('sha256', secret).update(value).digest('hex')
  const existing = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('translate-device='))
    ?.slice('translate-device='.length)
  let id: string | undefined
  if (existing && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(existing)) {
    const [candidate, signature] = existing.split('.') as [string, string]
    if (
      timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(sign(candidate), 'hex'),
      )
    )
      id = candidate
  }
  let setCookie: string | null = null
  if (!id) {
    id = randomUUID()
    setCookie = `translate-device=${id}.${sign(id)}; Path=/api/translate; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`
  }
  const now = Date.now()
  const day = Math.floor((now + 25200000) / 86400000)
  const reset = (day + 1) * 86400000 - 25200000
  const device = sign(`device:${id}`)
  const address = sign(`ip:${ip}`)
  const keys = [
    `translation:${day}:device:${device}`,
    `translation:${day}:ip:${address}`,
    `translation:${day}:global`,
    `translation:cooldown:device:${device}`,
    `translation:cooldown:ip:${address}`,
  ]
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      'EVAL',
      script,
      keys.length,
      ...keys,
      now,
      reset,
      consume ? '1' : '0',
    ]),
  })
  if (!response.ok) throw new Error('Quota storage unavailable')
  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !('result' in data) ||
    !Array.isArray(data.result) ||
    data.result.length !== 5
  )
    throw new Error('Invalid quota response')
  const [allowed, remaining, resetAt, retryAt, serverNow] =
    data.result as unknown[]
  const usage = parseUsage({
    limit: 30,
    remaining,
    resetAt,
    retryAt,
    serverNow,
  })
  if (!usage || (allowed !== 0 && allowed !== 1))
    throw new Error('Invalid quota response')
  return { allowed: allowed === 1, usage, cookie: setCookie }
}
