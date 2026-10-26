import { build } from 'esbuild'
import { Miniflare, createFetchMock } from 'miniflare'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { emptyInput } from '../src/features/vocabulary/model.ts'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

let script = ''
const instances: Miniflare[] = []
const temporaryStorage: string[] = []
beforeAll(async () => {
  const result = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
    loader: { '': 'text' },
  })
  script = result.outputFiles[0]!.text
})
afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.dispose()))
  const root = await realpath(tmpdir())
  for (const path of temporaryStorage.splice(0)) {
    const target = await realpath(path)
    if (
      dirname(target) !== root ||
      !basename(target).startsWith('english-hub-worker-')
    )
      throw new Error('Unexpected temporary storage path')
    await rm(target, { recursive: true })
  }
})

const result = {
  translation: 'Danh tiếng',
  entries: [
    { ...emptyInput, word: 'reputation', vietnamese_meaning: 'Danh tiếng' },
  ],
}
const body = { text: 'reputation', context: '', mode: 'word' }
function runtime(
  vars: Record<string, string> = {},
  status = 200,
  content: unknown = {
    choices: [
      { finish_reason: 'stop', message: { content: JSON.stringify(result) } },
    ],
  },
  persist?: string,
) {
  const fetchMock = createFetchMock()
  fetchMock.disableNetConnect()
  fetchMock
    .get('https://integrate.api.nvidia.com')
    .intercept({
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    })
    .reply(status, JSON.stringify(content))
    .persist()
  const instance = new Miniflare({
    modules: true,
    script,
    compatibilityDate: '2026-07-30',
    durableObjects: {
      TRANSLATION_LIMITS: {
        className: 'TranslationLimitsObject',
        useSQLite: true,
      },
    },
    durableObjectsPersist: persist,
    bindings: {
      OPENAI_API_KEY: 'test-secret',
      OPENAI_HOST: 'https://integrate.api.nvidia.com/v1',
      OPENAI_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b',
      ...vars,
    },
    fetchMock,
  })
  instances.push(instance)
  return instance
}
async function usage(instance: Miniflare, cookie = '', ip = '203.0.113.1') {
  return instance.dispatchFetch('https://hub.example/api/translate/usage', {
    headers: { 'CF-Connecting-IP': ip, Cookie: cookie },
  })
}
async function translate(
  instance: Miniflare,
  cookie = '',
  ip = '203.0.113.1',
  input: unknown = body,
) {
  return instance.dispatchFetch('https://hub.example/api/translate', {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': ip,
      Cookie: cookie,
      Origin: 'https://hub.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}
const cookieOf = (response: {
  headers: Headers | { get(name: string): string | null }
}) => response.headers.get('Set-Cookie')!.split(';')[0]!

it('serves validated translations, signed cookies, private headers and cooldowns', async () => {
  const instance = runtime()
  const initial = await usage(instance)
  expect(await initial.json()).toMatchObject({ limit: 20, remaining: 20 })
  expect(initial.headers.get('Set-Cookie')).toContain(
    'HttpOnly; Secure; SameSite=Strict',
  )
  const cookie = cookieOf(initial)
  const translated = await translate(instance, cookie)
  expect(translated.status).toBe(200)
  expect(await translated.json()).toEqual(result)
  expect(translated.headers.get('Cache-Control')).toBe('no-store')
  expect(translated.headers.get('X-Frame-Options')).toBe('DENY')
  expect(
    JSON.parse(translated.headers.get('X-Translate-Usage')!),
  ).toMatchObject({ remaining: 19 })
  const denied = await translate(instance, cookie)
  expect(denied.status).toBe(429)
  expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0)
  expect(await (await usage(instance, cookie)).json()).toMatchObject({
    remaining: 19,
  })
})

it('atomically enforces global limits across simultaneous devices and IPs', async () => {
  const instance = runtime({ TRANSLATE_GLOBAL_DAILY_LIMIT: '2' })
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      translate(instance, '', `203.0.113.${index + 1}`),
    ),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    2,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    6,
  )
  expect(
    await (await usage(instance, '', '203.0.113.99')).json(),
  ).toMatchObject({ remaining: 0 })
})

it('keeps device limits across IP changes and IP limits across new or tampered cookies', async () => {
  const instance = runtime({
    TRANSLATE_DAILY_LIMIT: '1',
    TRANSLATE_IP_DAILY_LIMIT: '1',
  })
  const first = await translate(instance)
  const cookie = cookieOf(first)
  expect((await translate(instance, cookie, '203.0.113.2')).status).toBe(429)
  expect((await translate(instance)).status).toBe(429)
  const forged = cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a')
  const replaced = await usage(instance, forged)
  expect(replaced.headers.get('Set-Cookie')).toBeTruthy()
  expect(await replaced.json()).toMatchObject({ remaining: 0 })
})

it('retains signed identity and counters after the runtime restarts', async () => {
  const directory = await mkdtemp(
    join(await realpath(tmpdir()), 'english-hub-worker-'),
  )
  temporaryStorage.push(directory)
  const first = runtime(
    { TRANSLATE_DAILY_LIMIT: '1' },
    200,
    undefined,
    directory,
  )
  const translated = await translate(first)
  expect(translated.status).toBe(200)
  const cookie = cookieOf(translated)
  await first.dispose()
  instances.splice(instances.indexOf(first), 1)
  const restarted = runtime(
    { TRANSLATE_DAILY_LIMIT: '1' },
    200,
    undefined,
    directory,
  )
  const status = await usage(restarted, cookie, '203.0.113.2')
  expect(status.headers.get('Set-Cookie')).toBeNull()
  expect(await status.json()).toMatchObject({ remaining: 0 })
  expect((await translate(restarted, cookie, '203.0.113.2')).status).toBe(429)
})

it('rejects invalid, cross-origin, oversized and unsupported API requests without consuming quota', async () => {
  const instance = runtime()
  expect((await translate(instance, '', '203.0.113.1', {})).status).toBe(400)
  expect(
    (
      await translate(instance, '', '203.0.113.1', {
        ...body,
        text: 'x'.repeat(41000),
      })
    ).status,
  ).toBe(413)
  const cross = await instance.dispatchFetch(
    'https://hub.example/api/translate',
    { method: 'POST', headers: { Origin: 'https://attacker.example' } },
  )
  expect(cross.status).toBe(403)
  expect(
    (await instance.dispatchFetch('https://hub.example/api/unknown')).status,
  ).toBe(404)
  const method = await instance.dispatchFetch(
    'https://hub.example/api/translate',
  )
  expect(method.status).toBe(405)
  expect(method.headers.get('Allow')).toBe('POST')
  expect(
    (
      await instance.dispatchFetch('https://hub.example/api/translate', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.1' },
      })
    ).status,
  ).toBe(415)
  expect(await (await usage(instance)).json()).toMatchObject({ remaining: 20 })
})

it('fails closed for missing keys, invalid hosts or quota settings', async () => {
  const cases: Record<string, string>[] = [
    { OPENAI_API_KEY: '' },
    { OPENAI_HOST: 'https://attacker.example/v1' },
    { TRANSLATE_DAILY_LIMIT: '0' },
  ]
  for (const vars of cases) {
    expect((await translate(runtime(vars))).status).toBe(503)
  }
})

it('charges provider failures without leaking keys or provider responses', async () => {
  const instance = runtime({}, 401, {
    error: 'test-secret private provider details',
  })
  const response = await translate(instance)
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain('test-secret')
  expect(JSON.parse(response.headers.get('X-Translate-Usage')!)).toMatchObject({
    remaining: 19,
  })
})

it('rejects incomplete or malformed model output', async () => {
  for (const content of [
    {
      choices: [
        {
          finish_reason: 'length',
          message: { content: JSON.stringify(result) },
        },
      ],
    },
    { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] },
  ]) {
    expect((await translate(runtime({}, 200, content))).status).toBe(502)
  }
})
