import { createServer, type Server } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { translationMiddleware } from './translate.ts'
import { emptyInput } from '../src/features/vocabulary/model.ts'
import { TranslationLimits } from './translationLimits.ts'

let server: Server | undefined
let limits: TranslationLimits | undefined
afterEach(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    )
    server = undefined
  }
  limits?.close()
  limits = undefined
})
async function start(
  key: string,
  upstream: typeof fetch,
  extra: Record<string, string> = {},
) {
  let now = Date.now()
  limits = new TranslationLimits(
    ':memory:',
    { TRANSLATE_COOLDOWN_SECONDS: '1' },
    () => now,
  )
  const middleware = translationMiddleware(
    { GEMINI_API_KEY: key, ...extra },
    upstream,
    () => limits!,
  )
  server = createServer((req, res) => {
    now += 1001
    void middleware(req, res, () => {
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No server address')
  return `http://127.0.0.1:${address.port}/api/translate`
}
const options = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'reputation', context: '', mode: 'word' }),
}

it('keeps the key upstream, returns validated data and does not leak provider errors', async () => {
  const result = {
    translation: 'Danh tiếng',
    entries: [
      { ...emptyInput, word: 'reputation', vietnamese_meaning: 'Danh tiếng' },
    ],
  }
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(result) }] },
          },
        ],
      }),
    ),
  )
  const url = await start('test-secret', upstream)
  const response = await fetch(url, options)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(upstream.mock.calls[0]?.[1]?.headers).toHaveProperty(
    'x-goog-api-key',
    'test-secret',
  )
  upstream.mockResolvedValueOnce(
    new Response('test-secret private details', { status: 401 }),
  )
  const failure = await fetch(url, options)
  expect(failure.status).toBe(502)
  expect(await failure.text()).not.toContain('test-secret')
})

it('rejects cross-origin calls, invalid bodies and invalid model output without retrying', async () => {
  const upstream = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ candidates: [] })))
  const url = await start('test-secret', upstream)
  expect(
    (
      await fetch(url, {
        ...options,
        headers: { ...options.headers, Origin: 'https://attacker.example' },
      })
    ).status,
  ).toBe(403)
  expect((await fetch(url, { ...options, body: '{}' })).status).toBe(400)
  expect(upstream).not.toHaveBeenCalled()
  expect((await fetch(url, options)).status).toBe(502)
  expect(upstream).toHaveBeenCalledTimes(1)
})

it('checks limits on direct requests, preserves cookies and sends Retry-After without calling AI again', async () => {
  const upstream = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('provider failed', { status: 500 }))
  const url = await start('test-secret', upstream)
  limits!.close()
  limits = new TranslationLimits(':memory:', { TRANSLATE_DAILY_LIMIT: '1' })
  const status = await fetch(`${url}/usage`)
  const cookie = status.headers.get('set-cookie')!.split(';')[0]!
  expect(await status.json()).toMatchObject({ limit: 1, remaining: 1 })
  const first = await fetch(url, {
    ...options,
    headers: { ...options.headers, Cookie: cookie },
  })
  expect(first.status).toBe(502)
  expect(JSON.parse(first.headers.get('x-translate-usage')!)).toMatchObject({
    remaining: 0,
  })
  const denied = await fetch(url, {
    ...options,
    headers: { ...options.headers, Cookie: cookie },
  })
  expect(denied.status).toBe(429)
  expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0)
  expect(upstream).toHaveBeenCalledTimes(1)
})

it('reports missing configuration without contacting Gemini', async () => {
  const upstream = vi.fn<typeof fetch>()
  const url = await start('', upstream)
  expect((await fetch(url, options)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
})

it.each(['router', 'openai'])(
  'uses %s configuration with the exact routing model and bearer key',
  async (style) => {
    const result = {
      translation: 'Uy tín',
      entries: [
        { ...emptyInput, word: 'reputation', vietnamese_meaning: 'Uy tín' },
      ],
    }
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify(result),
                reasoning_content: 'Not part of the result',
              },
            },
          ],
        }),
      ),
    )
    const url = await start(
      '',
      upstream,
      style === 'openai'
        ? {
            OPENAI_HOST: 'http://localhost:20128/v1/',
            OPENAI_API_KEY: 'router-test-secret',
            OPENAI_MODEL: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
          }
        : {
            TRANSLATE_PROVIDER: '9router',
            ROUTER_API_KEY: 'router-test-secret',
            ROUTER_BASE_URL: 'http://localhost:20128/v1/',
            ROUTER_MODEL: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
          },
    )
    const response = await fetch(url, options)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(result)
    const [endpoint, request] = upstream.mock.calls[0]!
    expect(endpoint).toBe('http://localhost:20128/v1/chat/completions')
    expect(request?.headers).toHaveProperty(
      'Authorization',
      'Bearer router-test-secret',
    )
    expect(request?.headers).not.toHaveProperty('x-goog-api-key')
    const body = JSON.parse(String(request?.body))
    expect(body.model).toBe('nvidia/nvidia/nemotron-3-ultra-550b-a55b')
    expect(body.stream).toBe(false)
    expect(body.max_tokens).toBe(4096)
    expect(JSON.parse(body.messages[1].content).text).toBe('reputation')
    upstream.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'length',
              message: { content: JSON.stringify(result) },
            },
          ],
        }),
      ),
    )
    expect((await fetch(url, options)).status).toBe(502)
  },
)

it('does not spend allowance for invalid input and fails closed if usage storage fails', async () => {
  const upstream = vi.fn<typeof fetch>()
  const url = await start('test-secret', upstream)
  const status = await fetch(`${url}/usage`)
  const cookie = status.headers.get('set-cookie')!.split(';')[0]!
  const headers = { ...options.headers, Cookie: cookie }
  expect(
    (
      await fetch(url, {
        ...options,
        headers,
        body: JSON.stringify({
          text: 'x'.repeat(1001),
          context: '',
          mode: 'word',
        }),
      })
    ).status,
  ).toBe(400)
  expect(await (await fetch(`${url}/usage`, { headers })).json()).toMatchObject(
    { remaining: 20 },
  )
  limits!.close()
  expect((await fetch(url, { ...options, headers })).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
  limits = undefined
})
