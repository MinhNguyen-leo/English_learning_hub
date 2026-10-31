import { expect, it, vi } from 'vitest'
import { emptyInput } from '../src/features/vocabulary/model.ts'
import { translateWithGemini } from './vercelGemini.ts'

const input = { text: 'hello', context: '', mode: 'word' } as const
const result = {
  translation: 'xin chào',
  entries: [{ ...emptyInput, word: 'hello', vietnamese_meaning: 'xin chào' }],
}

it('sends the key in a header and validates the Gemini result', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(result) }] },
          },
        ],
      }),
    )
  expect(
    await translateWithGemini(input, 'secret', 'gemini-3.6-flash', fetcher),
  ).toEqual({ status: 200, result })
  const [url, options] = fetcher.mock.calls[0]!
  expect(String(url)).not.toContain('secret')
  expect(new Headers(options?.headers).get('x-goog-api-key')).toBe('secret')
  expect(options?.redirect).toBe('manual')
})

it('rejects incomplete or invalid provider output without returning it', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: '{}' }] } },
        ],
      }),
    )
  await expect(
    translateWithGemini(input, 'secret', 'model', fetcher),
  ).rejects.toThrow()
})
