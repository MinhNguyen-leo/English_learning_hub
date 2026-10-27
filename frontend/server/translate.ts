import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import { TranslationLimits, positiveSetting } from './translationLimits.ts'
import type { TranslationUsage } from '../src/features/translate/usage.ts'
import {
  parseRequest,
  parseResult,
  resultSchema,
} from '../src/features/translate/model.ts'

import { instructions } from './translationPrompt.ts'

export function translationMiddleware(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
  getLimits?: () => TranslationLimits,
) {
  let limits: TranslationLimits | undefined
  let busy = false
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const path = req.url?.split('?')[0]
    if (path !== '/api/translate' && path !== '/api/translate/usage')
      return next()
    let replyUsage: (() => TranslationUsage) | undefined
    const reply = (status: number, body: unknown) => {
      if (replyUsage) {
        try {
          res.setHeader('X-Translate-Usage', JSON.stringify(replyUsage()))
        } catch {
          /* Keep the last confirmed usage if storage becomes unavailable. */
        }
      }
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }
    // This endpoint is deliberately local-only; public hosting needs abuse controls.
    const host = req.headers.host ?? ''
    if (
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        req.socket.remoteAddress ?? '',
      ) ||
      (req.headers.origin &&
        ![`http://${host}`, `https://${host}`].includes(req.headers.origin))
    )
      return reply(403, {
        error: 'Translation is only available from this local application.',
      })
    let quota: TranslationLimits
    let device: { id: string; cookie: string | null }
    const ip = req.socket.remoteAddress ?? ''
    try {
      quota = getLimits
        ? getLimits()
        : (limits ??= new TranslationLimits(
            resolve(process.cwd(), '../.translate-usage/limits.sqlite'),
            env,
          ))
      device = quota.device(req.headers.cookie)
      if (device.cookie) res.setHeader('Set-Cookie', device.cookie)
      if (path === '/api/translate/usage') {
        if (req.method !== 'GET') return reply(405, { error: 'Use GET.' })
        return reply(200, quota.get(device.id, ip))
      }
    } catch {
      return reply(503, {
        error:
          'Usage limits are unavailable. Translation was not sent. Please retry later.',
      })
    }
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })
    if (!req.headers['content-type']?.startsWith('application/json'))
      return reply(415, { error: 'Use application/json.' })
    const router =
      env.TRANSLATE_PROVIDER !== 'gemini' &&
      (env.TRANSLATE_PROVIDER === '9router' || Boolean(env.OPENAI_HOST))
    const apiKey = router
      ? env.OPENAI_API_KEY || env.ROUTER_API_KEY
      : env.GEMINI_API_KEY
    const model = env.OPENAI_MODEL || env.ROUTER_MODEL
    const baseUrl =
      env.OPENAI_HOST || env.ROUTER_BASE_URL || 'http://localhost:20128/v1'
    if (!apiKey || (router && !model))
      return reply(503, {
        error: router
          ? 'Configure OPENAI_API_KEY and OPENAI_MODEL (or ROUTER_API_KEY and ROUTER_MODEL) in frontend/.env.local and restart Vite.'
          : 'Configure GEMINI_API_KEY in frontend/.env.local and restart Vite.',
      })
    if (busy)
      return reply(429, {
        error: 'Another translation is running. Please wait and retry.',
      })
    busy = true
    try {
      let body = ''
      req.setEncoding('utf8')
      for await (const chunk of req) {
        body += String(chunk)
        if (Buffer.byteLength(body) > 40000)
          return reply(413, { error: 'Translation request is too large.' })
      }
      let input
      try {
        input = parseRequest(JSON.parse(body))
      } catch {
        return reply(400, {
          error: 'Enter 1–1000 characters and choose a valid translation mode.',
        })
      }
      try {
        const admission = quota.consume(device.id, ip)
        res.setHeader('X-Translate-Usage', JSON.stringify(admission.usage))
        replyUsage = () => quota.get(device.id, ip)
        if (!admission.allowed) {
          res.setHeader(
            'Retry-After',
            String(
              Math.max(
                1,
                Math.ceil(
                  (admission.usage.retryAt - admission.usage.serverNow) / 1000,
                ),
              ),
            ),
          )
          return reply(429, {
            error:
              admission.usage.remaining === 0
                ? 'Daily translation limit reached. Please wait until the displayed reset time.'
                : 'Please wait before translating again.',
          })
        }
      } catch {
        return reply(503, {
          error: 'Usage could not be recorded. Translation was not sent.',
        })
      }
      const response = await fetcher(
        router
          ? `${baseUrl.replace(/\/+$/, '')}/chat/completions`
          : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || 'gemini-3.8-flash')}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(router
              ? { Authorization: `Bearer ${apiKey}` }
              : { 'x-goog-api-key': apiKey }),
          },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify(
            router
              ? {
                  model,
                  ...(model === 'nvidia/nemotron-3-ultra-550b-a55b' ||
                  model === 'nvidia/nvidia/nemotron-3-ultra-550b-a55b'
                    ? { chat_template_kwargs: { enable_thinking: false } }
                    : {}),
                  stream: false,
                  max_tokens: positiveSetting(
                    env.TRANSLATE_MAX_OUTPUT_TOKENS,
                    4096,
                  ),
                  messages: [
                    {
                      role: 'system',
                      content: `${instructions}\nReturn exactly one JSON object matching this JSON schema. No code fences, commentary or reasoning in the answer:\n${JSON.stringify(resultSchema)}`,
                    },
                    { role: 'user', content: JSON.stringify(input) },
                  ],
                }
              : {
                  systemInstruction: { parts: [{ text: instructions }] },
                  contents: [
                    { role: 'user', parts: [{ text: JSON.stringify(input) }] },
                  ],
                  generationConfig: {
                    maxOutputTokens: positiveSetting(
                      env.TRANSLATE_MAX_OUTPUT_TOKENS,
                      4096,
                    ),
                    responseMimeType: 'application/json',
                    responseJsonSchema: resultSchema,
                  },
                },
          ),
        },
      )
      if (response.status === 504)
        return reply(504, {
          code: 'TRANSLATION_TIMEOUT',
          error:
            'The translation provider timed out. Your input was retained; please retry later.',
        })
      if (!response.ok) {
        const status = response.status === 429 ? 429 : 502
        return reply(status, {
          error:
            response.status === 429
              ? 'API quota reached. Check your quota before retrying.'
              : 'The translation provider could not translate. Check the server API key, model access and connection.',
        })
      }
      const data = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[]
        candidates?: {
          finishReason?: string
          content?: { parts?: { text?: string }[] }
        }[]
      }
      let text: string
      if (router) {
        const choice = data.choices?.[0]
        if (
          choice?.finish_reason !== 'stop' ||
          typeof choice.message?.content !== 'string'
        )
          throw new Error('Incomplete response')
        text = choice.message.content
          .trim()
          .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
      } else {
        const candidate = data.candidates?.[0]
        if (candidate?.finishReason !== 'STOP')
          throw new Error('Incomplete response')
        text =
          candidate.content?.parts?.map((part) => part.text ?? '').join('') ??
          ''
      }
      reply(200, parseResult(JSON.parse(text)))
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError')
        return reply(504, {
          code: 'TRANSLATION_TIMEOUT',
          error:
            'The translation provider did not finish within 60 seconds. Your input was retained; please retry later.',
        })
      reply(502, {
        error:
          'Translation failed or returned an invalid result. Your input was retained; please retry.',
      })
    } finally {
      busy = false
    }
  }
}

export function translationPlugin(
  env: Record<string, string | undefined>,
): Plugin {
  let quota: TranslationLimits | undefined
  const getLimits = () =>
    (quota ??= new TranslationLimits(
      resolve(process.cwd(), '../.translate-usage/limits.sqlite'),
      env,
    ))
  const close = () => {
    quota?.close()
    quota = undefined
  }
  return {
    name: 'local-translation-api',
    configureServer(server) {
      server.middlewares.use(translationMiddleware(env, fetch, getLimits))
      server.httpServer?.once('close', close)
    },
    config() {
      return {
        server: {
          fs: {
            deny: [
              '.env',
              '.env.*',
              '*.{crt,pem}',
              '**/.git/**',
              '**/.translate-usage/**',
            ],
          },
        },
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use(translationMiddleware(env, fetch, getLimits))
      server.httpServer.once('close', close)
    },
  }
}
