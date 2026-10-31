import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createTranslationHandler } from './vercelHandler.ts'
import { emptyInput } from '../src/features/vocabulary/model.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function response() {
  const headers = new Map<string, string>()
  return {
    statusCode: 0,
    setHeader: (name: string, value: string) => headers.set(name, value),
    end: vi.fn(),
    headers,
  }
}

it('does not contact Gemini when shared quota storage fails', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-secret')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const handler = createTranslationHandler(async () => {
    throw new Error('unavailable')
  })
  const req = {
    method: 'POST',
    url: '/api/translate',
    headers: {
      host: 'example.vercel.app',
      origin: 'https://example.vercel.app',
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.1',
    },
    body: { text: 'hello', context: '', mode: 'word' },
  } as unknown as IncomingMessage
  const res = response()
  await handler(req, res as unknown as ServerResponse)
  expect(res.statusCode).toBe(503)
  expect(fetcher).not.toHaveBeenCalled()
  expect(String(res.end.mock.calls[0]?.[0])).not.toContain('test-secret')
})

it('rejects cross-origin requests before quota or Gemini', async () => {
  const admit = vi.fn()
  const handler = createTranslationHandler(admit)
  const req = {
    method: 'POST',
    url: '/api/translate',
    headers: { host: 'example.vercel.app', origin: 'https://attacker.example' },
  } as IncomingMessage
  const res = response()
  await handler(req, res as unknown as ServerResponse)
  expect(res.statusCode).toBe(403)
  expect(admit).not.toHaveBeenCalled()
})

it('returns a validated translation and current usage through the existing API', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-secret')
  const result = {
    translation: 'xin chào',
    entries: [{ ...emptyInput, word: 'hello', vietnamese_meaning: 'xin chào' }],
  }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(result) }] },
            },
          ],
        }),
      ),
  )
  const usage = {
    limit: 30,
    remaining: 29,
    resetAt: 200,
    retryAt: 110,
    serverNow: 100,
  }
  const admit = vi
    .fn()
    .mockResolvedValue({ allowed: true, usage, cookie: null })
  const handler = createTranslationHandler(admit)
  const req = {
    method: 'POST',
    url: '/api/translate',
    headers: {
      host: 'example.vercel.app',
      origin: 'https://example.vercel.app',
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.1',
    },
    body: { text: 'hello', context: '', mode: 'word' },
  } as unknown as IncomingMessage
  const res = response()
  await handler(req, res as unknown as ServerResponse)
  expect(res.statusCode).toBe(200)
  expect(JSON.parse(String(res.end.mock.calls[0]?.[0]))).toEqual(result)
  expect(JSON.parse(res.headers.get('X-Translate-Usage')!)).toEqual(usage)
  expect(admit).toHaveBeenCalledWith('', '203.0.113.1', true)
})
