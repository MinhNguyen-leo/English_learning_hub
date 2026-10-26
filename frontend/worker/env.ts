export interface WorkerEnv {
  ASSETS: Fetcher
  TRANSLATION_LIMITS: DurableObjectNamespace
  OPENAI_API_KEY?: string
  OPENAI_HOST?: string
  OPENAI_MODEL?: string
  TRANSLATE_DAILY_LIMIT?: string
  TRANSLATE_IP_DAILY_LIMIT?: string
  TRANSLATE_GLOBAL_DAILY_LIMIT?: string
  TRANSLATE_COOLDOWN_SECONDS?: string
  TRANSLATE_MAX_OUTPUT_TOKENS?: string
}

export function positiveSetting(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Invalid translation limit configuration.')
  return number
}
