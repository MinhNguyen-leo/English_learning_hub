import { parseXlsx } from './xlsx'
self.onmessage = (
  event: MessageEvent<{ bytes: Uint8Array; filename: string }>,
) => {
  try {
    self.postMessage({
      sheet: parseXlsx(event.data.bytes, event.data.filename),
    })
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : 'Could not read workbook.',
    })
  }
}
