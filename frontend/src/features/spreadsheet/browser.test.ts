// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readUpload, downloadXlsx } from './browser'
import { MAX_FILE_BYTES, type ParsedSheet } from './xlsx'

class TestWorker {
  static latest: TestWorker
  onmessage:
    | ((event: { data: { sheet?: ParsedSheet; error?: string } }) => void)
    | null = null
  onerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    TestWorker.latest = this
  }
}
beforeEach(() => {
  vi.stubGlobal('Worker', TestWorker)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function file(name = 'words.xlsx') {
  const file = new File(['xlsx'], name)
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
  })
  return file
}
it('checks extension and size before reading or spawning a worker', async () => {
  const wrong = file('words.xlsm')
  await expect(readUpload(wrong)).rejects.toThrow('.xlsx')
  expect(wrong.arrayBuffer).not.toHaveBeenCalled()
  const large = file()
  Object.defineProperty(large, 'size', { value: MAX_FILE_BYTES + 1 })
  await expect(readUpload(large)).rejects.toThrow('5 MiB')
  expect(large.arrayBuffer).not.toHaveBeenCalled()
})
it('transfers upload bytes, receives results and terminates its worker', async () => {
  const pending = readUpload(file())
  await Promise.resolve()
  const worker = TestWorker.latest
  expect(worker.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'words.xlsx' }),
    expect.any(Array),
  )
  const sheet: ParsedSheet = {
    name: 'Words',
    headers: ['word'],
    rows: [],
    warnings: [],
  }
  worker.onmessage?.({ data: { sheet } })
  await expect(pending).resolves.toEqual(sheet)
  expect(worker.terminate).toHaveBeenCalledOnce()
})
it('surfaces parser errors and terminates the worker', async () => {
  const pending = readUpload(file())
  await Promise.resolve()
  TestWorker.latest.onmessage?.({ data: { error: 'Malformed workbook' } })
  await expect(pending).rejects.toThrow('Malformed workbook')
  expect(TestWorker.latest.terminate).toHaveBeenCalledOnce()
})
it('terminates timed-out workbook processing', async () => {
  vi.useFakeTimers()
  const pending = readUpload(file())
  const rejected = expect(pending).rejects.toThrow('15 seconds')
  await vi.advanceTimersByTimeAsync(15000)
  await rejected
  expect(TestWorker.latest.terminate).toHaveBeenCalledOnce()
})
it('surfaces worker startup/runtime failures', async () => {
  const pending = readUpload(file())
  await Promise.resolve()
  TestWorker.latest.onerror?.()
  await expect(pending).rejects.toThrow('processing failed')
  expect(TestWorker.latest.terminate).toHaveBeenCalledOnce()
})
it('downloads a real XLSX Blob and releases its temporary URL', async () => {
  vi.useFakeTimers()
  const create = vi.fn().mockReturnValue('blob:test'),
    revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }),
  )
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  downloadXlsx(new Uint8Array([1, 2, 3]), 'vocabulary.xlsx')
  expect(create.mock.calls[0]?.[0]).toHaveProperty(
    'type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  expect(click).toHaveBeenCalledOnce()
  expect(document.querySelector('a')).toBeNull()
  await vi.advanceTimersByTimeAsync(1000)
  expect(revoke).toHaveBeenCalledWith('blob:test')
})
