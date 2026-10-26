export interface TranslationUsage {
  limit: number
  remaining: number
  resetAt: number
  retryAt: number
  serverNow: number
}
export function parseUsage(value: unknown): TranslationUsage | null {
  if (!value || typeof value !== 'object') return null
  const usage = value as Record<string, unknown>
  if (
    !['limit', 'remaining', 'resetAt', 'retryAt', 'serverNow'].every(
      (key) =>
        typeof usage[key] === 'number' &&
        Number.isSafeInteger(usage[key]) &&
        usage[key] >= 0,
    )
  )
    return null
  if (Number(usage.limit) < 1 || Number(usage.remaining) > Number(usage.limit))
    return null
  return usage as unknown as TranslationUsage
}
