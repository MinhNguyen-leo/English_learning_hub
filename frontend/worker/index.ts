import {
  parseRequest,
  parseResult,
  resultSchema,
} from '../src/features/translate/model.ts'
import {
  parseUsage,
  type TranslationUsage,
} from '../src/features/translate/usage.ts'
import { instructions } from '../server/translationPrompt.ts'
import { positiveSetting, type WorkerEnv } from './env.ts'
import headerFile from '../public/_headers'
export { TranslationLimitsObject } from './limits.ts'

const securityHeaders = Object.fromEntries(
  headerFile
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const colon = line.indexOf(':')
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
    }),
)

async function readBounded(request: Request) {
  if (Number(request.headers.get('Content-Length')) > 40000) return null
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > 40000) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const headers = new Headers({
      ...securityHeaders,
      'Cache-Control': 'no-store',
    })
    const reply = (status: number, body: unknown) =>
      Response.json(body, { status, headers })
    const usagePath = url.pathname === '/api/translate/usage'
    if (!usagePath && url.pathname !== '/api/translate')
      return reply(404, { error: 'API route not found.' })
    if (
      (request.headers.has('Origin') &&
        request.headers.get('Origin') !== url.origin) ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site'
    )
      return reply(403, { error: 'Use this API from the application.' })
    const method = usagePath ? 'GET' : 'POST'
    if (request.method !== method) {
      headers.set('Allow', method)
      return reply(405, { error: `Use ${method}.` })
    }
    // Cloudflare sets this header on ingress; do not trust X-Forwarded-For.
    const ip = request.headers.get('CF-Connecting-IP')
    if (!ip)
      return reply(503, {
        error: 'Client identity is unavailable. Please retry later.',
      })
    let input
    let endpoint: URL | undefined
    let maxTokens = 4096
    if (!usagePath) {
      if (
        request.headers
          .get('Content-Type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() !== 'application/json'
      )
        return reply(415, { error: 'Use application/json.' })
      try {
        const body = await readBounded(request)
        if (body === null)
          return reply(413, { error: 'Translation request is too large.' })
        input = parseRequest(JSON.parse(body))
      } catch {
        return reply(400, {
          error: 'Enter 1–1000 characters and choose a valid translation mode.',
        })
      }
      try {
        if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL || !env.OPENAI_HOST)
          throw new Error('Missing provider settings')
        endpoint = new URL(
          env.OPENAI_HOST.replace(/\/+$/, '') + '/chat/completions',
        )
        // Only call explicitly supported OpenAI-compatible APIs; never follow
        // credential-bearing redirects.
        const providerEndpoint = endpoint.origin + endpoint.pathname
        if (
          ![
            'https://integrate.api.nvidia.com/v1/chat/completions',
            'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          ].includes(providerEndpoint) ||
          endpoint.username ||
          endpoint.password ||
          endpoint.search ||
          endpoint.hash
        )
          throw new Error('Invalid provider endpoint')
        maxTokens = positiveSetting(env.TRANSLATE_MAX_OUTPUT_TOKENS, 4096)
      } catch {
        return reply(503, {
          error:
            'Translation is not configured on the server. Please contact the site owner.',
        })
      }
    }
    let usage: TranslationUsage
    try {
      const id = env.TRANSLATION_LIMITS.idFromName('global-v1')
      const response = await env.TRANSLATION_LIMITS.get(id).fetch(
        'https://limits.internal/',
        {
          method: 'POST',
          body: JSON.stringify({
            cookie: request.headers.get('Cookie') ?? '',
            ip,
            consume: !usagePath,
          }),
        },
      )
      if (!response.ok) throw new Error('Storage unavailable')
      const admission = (await response.json()) as {
        allowed: boolean
        usage: unknown
        cookie: string | null
      }
      const parsed = parseUsage(admission.usage)
      if (!parsed) throw new Error('Invalid usage')
      usage = parsed
      if (admission.cookie) headers.set('Set-Cookie', admission.cookie)
      headers.set('X-Translate-Usage', JSON.stringify(usage))
      if (usagePath) return reply(200, usage)
      if (!admission.allowed) {
        headers.set(
          'Retry-After',
          String(
            Math.max(1, Math.ceil((usage.retryAt - usage.serverNow) / 1000)),
          ),
        )
        return reply(429, {
          error:
            usage.remaining === 0
              ? 'Daily translation limit reached. Please wait until the displayed reset time.'
              : 'Please wait before translating again.',
        })
      }
    } catch {
      return reply(503, {
        error:
          'Usage limits are unavailable. Translation was not sent. Please retry later.',
      })
    }
    try {
      const response = await fetch(endpoint!, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          ...(env.OPENAI_MODEL === 'nvidia/nemotron-3-ultra-550b-a55b'
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
          stream: false,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'system',
              content: `${instructions}\nReturn exactly one JSON object matching this JSON schema. No code fences, commentary or reasoning in the answer:\n${JSON.stringify(resultSchema)}`,
            },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      })
      if (response.status === 504)
        return reply(504, {
          code: 'TRANSLATION_TIMEOUT',
          error:
            'The translation provider timed out. Your input was retained; please retry later.',
        })
      if (!response.ok) {
        let providerError: string | undefined
        let errorShape = 'unreadable'
        let errorHint: string | undefined
        let hasProviderMessage = false
        let regionDetail: string | undefined
        try {
          const body: unknown = await response.json()
          const data = (Array.isArray(body) ? body[0] : body) as {
            error?: { status?: unknown; type?: unknown; message?: unknown }
          }
          errorShape =
            data?.error && typeof data.error === 'object'
              ? Array.isArray(body)
                ? 'error_array'
                : 'error_object'
              : Array.isArray(body)
                ? 'other_array'
                : 'other_json'
          const code = data?.error?.status ?? data?.error?.type
          if (
            typeof code === 'string' &&
            [
              'INVALID_ARGUMENT',
              'FAILED_PRECONDITION',
              'PERMISSION_DENIED',
              'UNAUTHENTICATED',
              'NOT_FOUND',
              'RESOURCE_EXHAUSTED',
              'INTERNAL',
              'UNAVAILABLE',
              'invalid_request_error',
              'authentication_error',
              'permission_error',
              'rate_limit_error',
              'server_error',
            ].includes(code)
          )
            providerError = code
          const message = data?.error?.message
          if (typeof message === 'string') {
            hasProviderMessage = message.length > 0
            if (
              /free tier/i.test(message) &&
              /region|country|location/i.test(message)
            )
              regionDetail = 'free_tier_region'
            else if (
              /(?:location|region|country).*(?:not supported|unavailable|not available)/i.test(
                message,
              )
            )
              regionDetail = 'location_unsupported'
            if (
              /api key.*(?:invalid|expired|not valid)|(?:invalid|expired).*api key/i.test(
                message,
              )
            )
              errorHint = 'api_key'
            else if (/billing|payment|credit/i.test(message))
              errorHint = 'billing'
            else if (/region|country|location|geograph/i.test(message))
              errorHint = 'region'
            else if (/terms|agreement|consent/i.test(message))
              errorHint = 'terms'
            else if (/project|account/i.test(message))
              errorHint = 'project_or_account'
            else if (
              /model.*(?:not found|unsupported|not supported)/i.test(message)
            )
              errorHint = 'model'
          }
        } catch {
          // The status still identifies the failure if the response is not JSON.
        }
        console.warn('Translation provider rejected request', {
          status: response.status,
          model: env.OPENAI_MODEL,
          providerError,
          errorShape,
          errorHint,
          hasProviderMessage,
          regionDetail,
        })
        return reply(response.status === 429 ? 429 : 502, {
          error:
            response.status === 429
              ? 'AI provider quota reached. Please retry later.'
              : 'The AI provider could not translate. Please retry later.',
        })
      }
      const data = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[]
      }
      const choice = data.choices?.[0]
      if (
        choice?.finish_reason !== 'stop' ||
        typeof choice.message?.content !== 'string'
      )
        throw new Error('Incomplete response')
      const text = choice.message.content
        .trim()
        .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
      return reply(200, parseResult(JSON.parse(text)))
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.warn('Translation provider timeout', {
          model: env.OPENAI_MODEL,
          timeoutMs: 60000,
        })
        return reply(504, {
          code: 'TRANSLATION_TIMEOUT',
          error:
            'The translation provider did not finish within 60 seconds. Your input was retained; please retry later.',
        })
      }
      return reply(502, {
        error:
          'Translation failed or returned an invalid result. Your input was retained; please retry.',
      })
    }
  },
} satisfies ExportedHandler<WorkerEnv>
