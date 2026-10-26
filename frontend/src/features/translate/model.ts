import {
  fieldNames,
  fields,
  validate,
  type VocabularyInput,
} from '../vocabulary/model.ts'

export const modes = ['auto', 'word', 'phrase', 'list', 'passage'] as const
export type TranslationMode = (typeof modes)[number]
export interface TranslationRequest {
  text: string
  context: string
  mode: TranslationMode
}
export interface TranslationResult {
  translation: string
  entries: VocabularyInput[]
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function parseRequest(value: unknown): TranslationRequest {
  if (
    !record(value) ||
    typeof value.text !== 'string' ||
    typeof value.context !== 'string' ||
    !modes.some((mode) => mode === value.mode)
  )
    throw new Error('Invalid translation request.')
  const text = value.text.trim()
  const context = value.context.trim()
  if (!text || text.length > 1000 || context.length > 1000)
    throw new Error(
      'Enter 1–1000 characters; context must be at most 1000 characters.',
    )
  return { text, context, mode: value.mode as TranslationMode }
}
export function parseResult(value: unknown): TranslationResult {
  if (
    !record(value) ||
    typeof value.translation !== 'string' ||
    !value.translation.trim() ||
    value.translation.length > 10000 ||
    !Array.isArray(value.entries) ||
    !value.entries.length ||
    value.entries.length > 5
  )
    throw new Error(
      'The translation service returned an invalid result. Please retry.',
    )
  const entries = value.entries.map((entry: unknown) => {
    if (!record(entry)) throw new Error('Invalid vocabulary result.')
    const input = {} as VocabularyInput
    for (const key of fieldNames) {
      if (typeof entry[key] !== 'string')
        throw new Error('Invalid vocabulary result.')
      input[key] = entry[key]
    }
    return validate(input)
  })
  return { translation: value.translation.trim(), entries }
}
export const resultSchema = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
    entries: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        properties: Object.fromEntries(
          fieldNames.map((key) => [
            key,
            { type: 'string', maxLength: fields[key].limit },
          ]),
        ),
        required: fieldNames,
        additionalProperties: false,
      },
    },
  },
  required: ['translation', 'entries'],
  additionalProperties: false,
}
