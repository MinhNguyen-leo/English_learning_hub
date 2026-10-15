import { MAX_FILE_BYTES, type ParsedSheet } from './xlsx'

export async function readUpload(file: File): Promise<ParsedSheet> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file.')
  if (file.size > MAX_FILE_BYTES)
    throw new Error('File exceeds the 5 MiB limit.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), {
      type: 'module',
    })
    const finish = () => {
      window.clearTimeout(timer)
      worker.terminate()
    }
    const timer = window.setTimeout(() => {
      finish()
      reject(
        new Error(
          'Workbook processing exceeded 15 seconds. Use a smaller or simpler file.',
        ),
      )
    }, 15000)
    worker.onmessage = (
      event: MessageEvent<{ sheet?: ParsedSheet; error?: string }>,
    ) => {
      finish()
      if (event.data.sheet) resolve(event.data.sheet)
      else reject(new Error(event.data.error ?? 'Could not read workbook.'))
    }
    worker.onerror = () => {
      finish()
      reject(
        new Error('Workbook processing failed. Retry with a valid XLSX file.'),
      )
    }
    worker.postMessage({ bytes, filename: file.name }, [bytes.buffer])
  })
}
export function downloadXlsx(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
