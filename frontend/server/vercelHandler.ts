import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseRequest } from '../src/features/translate/model.ts'
import type { TranslationUsage } from '../src/features/translate/usage.ts'
import { translateWithGemini } from './vercelGemini.ts'

export interface Admission {
  allowed: boolean
  usage: TranslationUsage
  cookie: string | null
}

export type Admit = (
  cookie: string,
  ip: string,
  consume: boolean,
) => Promise<Admission>

export function createTranslationHandler(admit: Admit) {
  return async (
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
  ) => {
    const reply = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    }
    const usagePath = req.url?.split('?')[0] === '/api/translate/usage'
    const method = usagePath ? 'GET' : 'POST'
    if (req.method !== method) {
      res.setHeader('Allow', method)
      return reply(405, { error: `Use ${method}.` })
    }
    const origin = req.headers.origin
    if (
      (origin && origin !== `https://${req.headers.host}`) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return reply(403, { error: 'Use this API from the application.' })
    const ip = req.headers['x-vercel-forwarded-for']
    if (typeof ip !== 'string' || !ip || ip.includes(','))
      return reply(503, {
        error: 'Client identity is unavailable. Please retry later.',
      })

    let input
    if (!usagePath) {
      if (
        req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        return reply(415, { error: 'Use application/json.' })
      if (
        Number(req.headers['content-length']) > 40000 ||
        Buffer.byteLength(JSON.stringify(req.body ?? null)) > 40000
      )
        return reply(413, { error: 'Translation request is too large.' })
      try {
        input = parseRequest(req.body)
      } catch {
        return reply(400, {
          error: 'Enter 1–1000 characters and choose a valid translation mode.',
        })
      }
      if (!process.env.GEMINI_API_KEY)
        return reply(503, {
          error: 'Translation is not configured on the server.',
        })
    }

    let admission: Admission
    try {
      admission = await admit(req.headers.cookie ?? '', ip, !usagePath)
    } catch {
      return reply(503, {
        error:
          'Usage limits are unavailable. Translation was not sent. Please retry later.',
      })
    }
    if (admission.cookie) res.setHeader('Set-Cookie', admission.cookie)
    res.setHeader('X-Translate-Usage', JSON.stringify(admission.usage))
    if (usagePath) return reply(200, admission.usage)
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
        error: 'Translation limit reached. Please wait before retrying.',
      })
    }
    try {
      const answer = await translateWithGemini(
        input!,
        process.env.GEMINI_API_KEY!,
        process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      )
      if (answer.status !== 200)
        return reply(answer.status, {
          error:
            answer.status === 429
              ? 'AI provider quota reached. Please retry later.'
              : 'The AI provider could not translate. Please retry later.',
        })
      return reply(200, answer.result)
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError')
        return reply(504, {
          code: 'TRANSLATION_TIMEOUT',
          error:
            'The translation provider did not finish within 50 seconds. Your input was retained; please retry later.',
        })
      return reply(502, {
        error:
          'Translation failed or returned an invalid result. Your input was retained; please retry.',
      })
    }
  }
}
