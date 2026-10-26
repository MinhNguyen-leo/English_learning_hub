import { parseRequest, parseResult, type TranslationRequest } from './model'
import { parseUsage, type TranslationUsage } from './usage'

export async function loadUsage(signal: AbortSignal) {
  const response = await fetch('/api/translate/usage', {
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Unable to load translation limits.')
  const usage = parseUsage(await response.json())
  if (!usage) throw new Error('Invalid translation limits.')
  return usage
}

export async function translate(
  input: TranslationRequest,
  signal: AbortSignal,
  onUsage?: (usage: TranslationUsage) => void,
) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parseRequest(input)),
    signal,
  })
  const usage = parseUsage(
    JSON.parse(response.headers.get('X-Translate-Usage') || 'null'),
  )
  if (usage) onUsage?.(usage)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : 'Translation is unavailable. Check the local API configuration and connection.'
    throw new Error(message)
  }
  return parseResult(body)
}
