import {
  parseResult,
  resultSchema,
  type TranslationRequest,
} from '../src/features/translate/model.ts'
import { instructions } from './translationPrompt.ts'

export async function translateWithGemini(
  input: TranslationRequest,
  key: string,
  model: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(50000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseJsonSchema: resultSchema,
        },
      }),
    },
  )
  if (!response.ok) {
    let region = false
    try {
      const data: unknown = await response.json()
      if (data && typeof data === 'object' && 'error' in data) {
        const error = data.error
        if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        )
          region = /region|country|location/i.test(error.message)
      }
    } catch {
      // Provider errors are intentionally not logged verbatim.
    }
    console.warn('Gemini request rejected', { status: response.status, region })
    return { status: response.status === 429 ? 429 : 502 } as const
  }
  const data = (await response.json()) as {
    candidates?: {
      finishReason?: string
      content?: { parts?: { text?: string }[] }
    }[]
  }
  const candidate = data.candidates?.[0]
  if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete response')
  const text =
    candidate.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  return { status: 200, result: parseResult(JSON.parse(text)) } as const
}
