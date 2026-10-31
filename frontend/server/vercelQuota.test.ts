import { afterEach, expect, it, vi } from 'vitest'
import { admitTranslation } from './vercelQuota.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function configure() {
  vi.stubEnv('TRANSLATE_QUOTA_SECRET', 'a'.repeat(32))
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'private-token')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
}

it('sends only keyed hashes of client identifiers and uses a signed cookie', async () => {
  configure()
  const now = Date.now()
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ result: [1, 29, now + 10000, now + 10000, now] }),
    )
  vi.stubGlobal('fetch', fetcher)
  const result = await admitTranslation('', '203.0.113.42', true)
  expect(result.allowed).toBe(true)
  expect(result.usage.remaining).toBe(29)
  expect(result.cookie).toContain('HttpOnly; Secure; SameSite=Strict')
  const body = String(fetcher.mock.calls[0]?.[1]?.body)
  expect(body).not.toContain('203.0.113.42')
  expect(body).not.toContain(result.cookie!.split('=')[1]!.split('.')[0]!)
  expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual')
})

it('fails closed for an invalid Redis endpoint or malformed Redis response', async () => {
  configure()
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ result: 'invalid' }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://attacker.example')
  await expect(admitTranslation('', '203.0.113.42', true)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  await expect(admitTranslation('', '203.0.113.42', true)).rejects.toThrow()
})
