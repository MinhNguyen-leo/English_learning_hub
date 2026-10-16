// Shared conservative identity for study prompts, not a semantic comparison.
export function normalizeStudyText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Apply after shuffling: mistakes come first, ties keep their random order.
export function prioritizeMistakes<T>(
  items: readonly T[],
  word: (item: T) => string,
  mistakes: ReadonlySet<string>,
): T[] {
  return [
    ...items.filter((item) => mistakes.has(normalizeStudyText(word(item)))),
    ...items.filter((item) => !mistakes.has(normalizeStudyText(word(item)))),
  ]
}
