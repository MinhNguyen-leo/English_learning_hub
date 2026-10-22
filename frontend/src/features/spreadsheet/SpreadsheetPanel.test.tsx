// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SpreadsheetPanel from './SpreadsheetPanel'
import { readUpload, downloadXlsx } from './browser'
import { emptyInput, fieldNames, type Vocabulary } from '../vocabulary/model'
import type { VocabularyRepository } from '../vocabulary/repository'
import { autoMapping, parseXlsx, previewRows, type ParsedSheet } from './xlsx'

vi.mock('./browser', () => ({ readUpload: vi.fn(), downloadXlsx: vi.fn() }))
const sheet: ParsedSheet = {
  name: 'User words',
  headers: ['Term', 'Definition', 'Details'],
  warnings: [],
  rows: [
    {
      rowNumber: 2,
      cells: [
        { text: 'hello', error: '' },
        { text: 'greeting', error: '' },
        { text: 'xin chào', error: '' },
      ],
    },
    {
      rowNumber: 4,
      cells: [
        { text: '', error: '' },
        { text: 'missing word', error: '' },
        { text: '', error: '' },
      ],
    },
    {
      rowNumber: 5,
      cells: [
        { text: ' HELLO ', error: '' },
        { text: 'Greeting', error: '' },
        { text: 'new note', error: '' },
      ],
    },
  ],
}
let repo: VocabularyRepository
beforeEach(() => {
  vi.mocked(readUpload).mockResolvedValue(sheet)
  repo = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    importEntries: vi.fn().mockResolvedValue([]),
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
async function uploadAndMap(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText('XLSX file'),
    new File(['data'], 'words.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  await screen.findByRole('heading', { name: /Map columns/ })
  await user.selectOptions(screen.getByLabelText('Map Word'), '0')
  await user.selectOptions(screen.getByLabelText('Map English meaning'), '1')
  await user.selectOptions(screen.getByLabelText('Map Note'), '2')
  await user.click(screen.getByRole('button', { name: 'Preview import' }))
  await screen.findByRole('heading', { name: '2. Review and import' })
}
it('maps custom columns, previews invalid and duplicate rows, and requires consent before importing only valid rows', async () => {
  const user = userEvent.setup(),
    imported = vi.fn()
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={imported}
    />,
  )
  await uploadAndMap(user)
  expect(repo.importEntries).not.toHaveBeenCalled()
  expect(
    screen.getByText(/2 valid rows; 1 invalid rows; 1 duplicate rows/),
  ).toBeTruthy()
  expect(screen.getByText(/Invalid: Word is required/)).toBeTruthy()
  const confirm = screen.getByRole('button', { name: 'Confirm import' })
  expect(confirm.hasAttribute('disabled')).toBe(true)
  await user.selectOptions(screen.getByLabelText('Duplicate handling'), 'keep')
  await user.click(screen.getByRole('checkbox'))
  await user.click(confirm)
  await waitFor(() => expect(imported).toHaveBeenCalledWith([], ['hello']))
  expect(repo.importEntries).toHaveBeenCalledWith(
    [
      {
        ...emptyInput,
        word: 'hello',
        english_meaning: 'greeting',
        note: 'xin chào',
      },
      {
        ...emptyInput,
        word: 'HELLO',
        english_meaning: 'Greeting',
        note: 'new note',
      },
    ],
    'keep',
    [],
  )
})
it('retains preview after transaction errors and lets users refresh then retry', async () => {
  vi.mocked(repo.importEntries).mockRejectedValueOnce(
    new Error('Library changed since preview'),
  )
  const user = userEvent.setup()
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  )
  await uploadAndMap(user)
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Confirm import' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Library changed since preview',
  )
  expect(screen.getByRole('region', { name: 'Import preview' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Refresh preview' }))
  expect(repo.list).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false)
})
it('confirms cancellation and never writes on cancel', async () => {
  const user = userEvent.setup(),
    close = vi.fn()
  render(
    <SpreadsheetPanel repository={repo} onClose={close} onImported={vi.fn()} />,
  )
  await uploadAndMap(user)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Close Excel tools' }))
  expect(close).not.toHaveBeenCalled()
  vi.mocked(window.confirm).mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Close Excel tools' }))
  expect(close).toHaveBeenCalledOnce()
  expect(repo.importEntries).not.toHaveBeenCalled()
})
it('downloads the blank template and exports the full saved repository', async () => {
  const saved: Vocabulary = {
    ...emptyInput,
    id: '1',
    word: 'hello',
    vietnamese_meaning: 'xin chào',
    created_at: 'now',
    updated_at: 'now',
  }
  vi.mocked(repo.list).mockResolvedValue([saved])
  const user = userEvent.setup()
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Download blank template' }),
  )
  expect(downloadXlsx).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    'vocabulary-template.xlsx',
  )
  await user.click(
    screen.getByRole('button', { name: 'Export all vocabulary' }),
  )
  expect(repo.list).toHaveBeenCalledOnce()
  expect(downloadXlsx).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    'vocabulary.xlsx',
  )
  expect(screen.getByRole('status')).toHaveProperty(
    'textContent',
    'Exported 1 entries.',
  )
})
it('previews an example without uploading or changing vocabulary and downloads the same importable worksheet', async () => {
  const user = userEvent.setup()
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  )
  const toggle = screen.getByRole('button', { name: 'Preview Excel template' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(
    screen.queryByRole('region', { name: 'Excel template example' }),
  ).toBeNull()
  await user.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  const example = screen.getByRole('region', { name: 'Excel template example' })
  for (const field of fieldNames) {
    expect(
      within(example).getByRole('columnheader', { name: field }),
    ).toBeTruthy()
  }
  expect(within(example).getByText('curious')).toBeTruthy()
  expect(within(example).getByText('discover')).toBeTruthy()
  expect(readUpload).not.toHaveBeenCalled()
  expect(repo.list).not.toHaveBeenCalled()
  expect(repo.importEntries).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Download example workbook' }),
  )
  const [bytes, filename] = vi.mocked(downloadXlsx).mock.calls[0]!
  expect(filename).toBe('vocabulary-example.xlsx')
  const parsed = parseXlsx(bytes, filename)
  const rows = previewRows(parsed, autoMapping(parsed.headers))
  expect(parsed.headers).toEqual(fieldNames)
  expect(rows.map((row) => row.errors)).toEqual([[], []])
  expect(rows.map((row) => row.input.word)).toEqual(['curious', 'discover'])
  for (const row of rows) {
    for (const field of fieldNames) {
      if (row.input[field])
        expect(within(example).getByText(row.input[field])).toBeTruthy()
    }
  }
  expect(repo.importEntries).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Hide Excel template' }))
  expect(
    screen.queryByRole('region', { name: 'Excel template example' }),
  ).toBeNull()
})
it('shows file errors without writing and blocks preview until required columns are mapped', async () => {
  const user = userEvent.setup()
  vi.mocked(readUpload).mockRejectedValueOnce(new Error('Malformed workbook'))
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  )
  const file = new File(['data'], 'words.xlsx')
  await user.upload(screen.getByLabelText('XLSX file'), file)
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Malformed workbook',
  )
  await user.upload(screen.getByLabelText('XLSX file'), file)
  await screen.findByRole('heading', { name: /Map columns/ })
  expect(
    screen
      .getByRole('button', { name: 'Preview import' })
      .hasAttribute('disabled'),
  ).toBe(true)
  expect(repo.importEntries).not.toHaveBeenCalled()
})

it('warns about matching words even when their meanings differ', async () => {
  vi.mocked(repo.list).mockResolvedValue([
    {
      ...emptyInput,
      id: '1',
      word: 'HELLO',
      english_meaning: 'another meaning',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])
  const user = userEvent.setup()
  render(
    <SpreadsheetPanel
      repository={repo}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  )
  await uploadAndMap(user)
  expect(
    screen.getByText(/Repeated words in this file or your library: hello/),
  ).toBeTruthy()
  expect(repo.importEntries).not.toHaveBeenCalled()
})
