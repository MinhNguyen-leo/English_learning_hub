// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { VocabularyManager } from './VocabularyManager'
import { emptyInput, type Vocabulary } from './model'
import type { VocabularyRepository } from './repository'
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function repository(): VocabularyRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockRejectedValue(new Error('Storage full')),
    update: vi.fn(),
    delete: vi.fn(),
    importEntries: vi.fn(),
  }
}
it('paginates filtered words, changes page sizes and supports a continuous list', async () => {
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue(
    Array.from({ length: 61 }, (_, index) => ({
      ...emptyInput,
      id: String(index),
      word: `word${String(index).padStart(3, '0')}`,
      english_meaning: 'definition',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
  )
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  await screen.findByRole('button', { name: 'Word for word000' })
  const table = screen.getByRole('table')
  const count = () => within(table).getAllByRole('row').length - 1
  expect(count()).toBe(20)
  expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty(
    'disabled',
    true,
  )
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByRole('button', { name: 'Word for word020' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Last page' }))
  expect(count()).toBe(1)
  expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty(
    'disabled',
    true,
  )
  await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'word060')
  expect(screen.getByText('Showing 1–1 of 1 words')).toBeTruthy()
  await user.clear(screen.getByRole('searchbox', { name: 'Search' }))
  for (const size of [40, 60, 100]) {
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Words per page' }),
      String(size),
    )
    expect(count()).toBe(Math.min(size, 61))
  }
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Table view' }),
    'all',
  )
  expect(count()).toBe(61)
  expect(
    screen.queryByRole('navigation', { name: 'Vocabulary pages' }),
  ).toBeNull()
  expect(screen.queryByText(/Stored in IndexedDB/)).toBeNull()
}, 20000)

it('toggles the combined Excel tools button open and closed', async () => {
  const user = userEvent.setup()
  render(<VocabularyManager repository={repository()} />)
  const toggle = screen.getByRole('button', { name: 'Import / Export XLSX' })
  await waitFor(() => expect(toggle).toHaveProperty('disabled', false))
  await user.click(toggle)
  await screen.findByRole('heading', { name: 'Excel import and export' })
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  await user.click(toggle)
  expect(
    screen.queryByRole('heading', { name: 'Excel import and export' }),
  ).toBeNull()
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
})
it.each(['add', 'edit'] as const)(
  'selects a part of speech and saves with Shift+Enter during %s',
  async (mode) => {
    const row: Vocabulary = {
      ...emptyInput,
      id: 'pos-test',
      word: 'hello',
      english_meaning: 'greeting',
      part_of_speech: 'noun',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const repo = repository()
    vi.mocked(repo.list).mockResolvedValue(mode === 'edit' ? [row] : [])
    vi.mocked(repo.create).mockResolvedValue({
      ...row,
      part_of_speech: 'adjective',
    })
    vi.mocked(repo.update).mockResolvedValue({
      ...row,
      part_of_speech: 'adjective',
    })
    const user = userEvent.setup()
    render(<VocabularyManager repository={repo} />)
    if (mode === 'edit')
      await user.dblClick(
        await screen.findByRole('button', { name: 'Part of speech for hello' }),
      )
    else {
      await waitFor(() =>
        expect(
          screen
            .getByRole('button', { name: 'Add vocabulary' })
            .hasAttribute('disabled'),
        ).toBe(false),
      )
      await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
      await user.type(screen.getByLabelText('Word'), 'hello')
      await user.type(screen.getByLabelText('Definition'), 'greeting')
      await user.click(screen.getByRole('combobox', { name: 'Part of speech' }))
    }
    expect(
      screen
        .getAllByRole('option')
        .filter((option) => option.closest('[role="listbox"]')),
    ).toHaveLength(10)
    const picker = screen.getByRole('combobox', { name: 'Part of speech' })
    await user.type(picker, 'adj')
    await user.click(screen.getByRole('option', { name: 'Adjective' }))
    expect(picker).toHaveProperty('value', 'adjective')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Part of speech' }),
      ).toBeNull(),
    )
    const input = expect.objectContaining({ part_of_speech: 'adjective' })
    if (mode === 'add') expect(repo.create).toHaveBeenCalledWith(input)
    else expect(repo.update).toHaveBeenCalledWith(row.id, input, row.updated_at)
  },
)
it.each(['add', 'edit'] as const)(
  'saves with Shift+Enter during %s while ordinary Enter adds a newline',
  async (mode) => {
    const row: Vocabulary = {
      ...emptyInput,
      id: 'shortcut',
      word: 'hello',
      english_meaning: 'greeting',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const repo = repository()
    vi.mocked(repo.list).mockResolvedValue(mode === 'edit' ? [row] : [])
    vi.mocked(repo.create).mockResolvedValue(row)
    vi.mocked(repo.update).mockResolvedValue(row)
    const user = userEvent.setup()
    render(<VocabularyManager repository={repo} />)
    if (mode === 'edit') {
      await user.dblClick(
        await screen.findByRole('button', { name: 'Note for hello' }),
      )
    } else {
      await waitFor(() =>
        expect(
          screen
            .getByRole('button', { name: 'Add vocabulary' })
            .hasAttribute('disabled'),
        ).toBe(false),
      )
      await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
      await user.type(screen.getByLabelText('Word'), 'hello')
      await user.type(screen.getByLabelText('Definition'), 'greeting')
    }
    await user.type(screen.getByLabelText('Note'), 'line 1{Enter}line 2')
    expect(screen.getByLabelText('Note')).toHaveProperty(
      'value',
      'line 1\nline 2',
    )
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await waitFor(() => expect(screen.queryByLabelText('Note')).toBeNull())
    const input = expect.objectContaining({
      word: 'hello',
      note: 'line 1\nline 2',
    })
    if (mode === 'add')
      expect(repo.create).toHaveBeenCalledExactlyOnceWith(input)
    else
      expect(repo.update).toHaveBeenCalledExactlyOnceWith(
        row.id,
        input,
        row.updated_at,
      )
  },
)
it('preserves a failed-save draft, confirms discard, and warns before unloading', async () => {
  const user = userEvent.setup()
  const repo = repository()
  render(<VocabularyManager repository={repo} />)
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Add vocabulary' })
        .hasAttribute('disabled'),
    ).toBe(false),
  )
  await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
  await user.type(screen.getByLabelText('Word'), 'bank')
  await user.type(screen.getByLabelText('Definition'), 'river side')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Storage full',
  )
  expect(screen.getByLabelText('Word')).toHaveProperty('value', 'bank')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByLabelText('Word')).toHaveProperty('value', 'bank')
  vi.mocked(window.confirm).mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByLabelText('Word')).toBeNull()
})
it('saves an inline edit and requires confirmation to delete', async () => {
  const row: Vocabulary = {
    ...emptyInput,
    id: 'test',
    word: 'bank',
    english_meaning: 'river side',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue([row])
  vi.mocked(repo.update).mockResolvedValue({ ...row, note: 'remember' })
  vi.mocked(repo.delete).mockResolvedValue()
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  const noteCell = await screen.findByRole('button', { name: 'Note for bank' })
  const addedTime = `Added: ${new Date(row.created_at).toLocaleString()}`
  expect(noteCell.getAttribute('title')).toBe(addedTime)
  expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull()
  await user.click(noteCell)
  expect(screen.queryByLabelText('Note')).toBeNull()
  await user.dblClick(noteCell)
  expect(screen.getByLabelText('Note').getAttribute('title')).toBe(addedTime)
  expect(document.activeElement).toBe(screen.getByLabelText('Note'))
  expect(screen.queryByRole('columnheader', { name: 'Updated' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Edit bank' })).toBeNull()
  await user.type(screen.getByLabelText('Note'), 'remember')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('remember')).toBeTruthy()
  expect(repo.update).toHaveBeenCalledWith(
    row.id,
    expect.objectContaining({ note: 'remember' }),
    row.updated_at,
  )
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Delete bank' }))
  expect(repo.delete).not.toHaveBeenCalled()
  vi.mocked(window.confirm).mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Delete bank' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Word for bank' })).toBeNull(),
  )
})

it('opens Quick Add after loading and preserves drafts when discard is declined', async () => {
  const repo = repository()
  const user = userEvent.setup()
  const { rerender } = render(
    <VocabularyManager repository={repo} addTrigger={1} />,
  )
  expect(await screen.findByLabelText('Word')).toHaveProperty('value', '')
  await user.type(screen.getByLabelText('Word'), 'bank')
  rerender(<VocabularyManager repository={repo} addTrigger={1} />)
  expect(screen.getByLabelText('Word')).toHaveProperty('value', 'bank')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  rerender(<VocabularyManager repository={repo} addTrigger={2} />)
  expect(window.confirm).toHaveBeenCalled()
  expect(screen.getByLabelText('Word')).toHaveProperty('value', 'bank')
})

it('sorts words alphabetically and by time added', async () => {
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue([
    {
      ...emptyInput,
      id: '1',
      word: 'zebra',
      english_meaning: 'animal',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      ...emptyInput,
      id: '2',
      word: 'apple',
      english_meaning: 'fruit',
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    },
  ])
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  await screen.findByRole('button', { name: 'Word for apple' })
  const words = () =>
    within(screen.getByRole('table'))
      .getAllByRole('button', { name: /^Word for/ })
      .map((button) => button.getAttribute('aria-label'))
  expect(words()).toEqual(['Word for apple', 'Word for zebra'])
  await user.selectOptions(screen.getByLabelText('Order'), 'desc')
  expect(words()).toEqual(['Word for zebra', 'Word for apple'])
  await user.selectOptions(screen.getByLabelText('Sort by'), 'created_at')
  expect(words()).toEqual(['Word for apple', 'Word for zebra'])
  await user.selectOptions(screen.getByLabelText('Order'), 'asc')
  expect(words()).toEqual(['Word for zebra', 'Word for apple'])
})
it('warns about a repeated word with a different meaning and preserves the draft on cancel', async () => {
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue([
    {
      ...emptyInput,
      id: '1',
      word: 'bank',
      english_meaning: 'river side',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  await screen.findByRole('button', { name: 'Word for bank' })
  await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
  await user.type(screen.getByLabelText('Word'), ' BANK ')
  await user.type(screen.getByLabelText('Definition'), 'financial institution')
  expect(
    screen.getByText(
      'This word already exists in your library. Check its meanings before saving.',
    ),
  ).toBeTruthy()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(window.confirm).toHaveBeenCalled())
  expect(repo.create).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Word')).toHaveProperty('value', ' BANK ')
})

it('updates the import notification after duplicates are deleted and preserves it on storage failure', async () => {
  vi.spyOn(await import('../spreadsheet/browser'), 'readUpload').mockResolvedValue({
    name: 'Words', headers: ['word', 'english_meaning'], warnings: [],
    rows: [
      { rowNumber: 2, cells: [{ text: 'bank', error: '' }, { text: 'river side', error: '' }] },
      { rowNumber: 3, cells: [{ text: 'BANK', error: '' }, { text: 'financial institution', error: '' }] },
    ],
  })
  const repo = repository()
  vi.mocked(repo.importEntries).mockResolvedValue([
    { ...emptyInput, id: '1', word: 'bank', english_meaning: 'river side', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { ...emptyInput, id: '2', word: 'BANK', english_meaning: 'financial institution', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ])
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add vocabulary' })).toHaveProperty('disabled', false))
  await user.click(screen.getByRole('button', { name: /Import \/ Export XLSX/ }))
  await user.upload(await screen.findByLabelText('XLSX file'), new File(['data'], 'words.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  await screen.findByRole('heading', { name: /Map columns/ })
  await user.click(screen.getByRole('button', { name: 'Preview import' }))
  await user.click(await screen.findByRole('button', { name: 'Confirm import' }))
  expect(await screen.findByText('Repeated words in your library:')).toBeTruthy()
  expect(screen.queryByLabelText('XLSX file')).toBeNull()
  expect(within(screen.getByRole('listitem')).getByText('bank')).toBeTruthy()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(repo.delete).mockRejectedValueOnce(new Error('Storage failed'))
  const deleteButton = screen.getAllByRole('button', { name: /Delete/ }).find(button => button.getAttribute('aria-label')?.includes('bank'))
  expect(deleteButton).toBeTruthy()
  await user.click(deleteButton!)
  expect(await screen.findByText('Storage failed')).toBeTruthy()
  expect(screen.getByText('Repeated words in your library:')).toBeTruthy()
  await user.click(deleteButton!)
  await waitFor(() => expect(screen.queryByText('Repeated words in your library:')).toBeNull())
  expect(screen.queryByText('Repeated words in your library:')).toBeNull()
})

it('detects existing repeated words on every load without an import and regardless of search', async () => {
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue([
    { ...emptyInput, id: '1', word: 'demanding', english_meaning: 'hard', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { ...emptyInput, id: '2', word: ' DEMANDING ', english_meaning: 'requires effort', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ])
  const user = userEvent.setup()
  const first = render(<VocabularyManager repository={repo} />)
  expect(await screen.findByText('Repeated words in your library:')).toBeTruthy()
  expect(within(screen.getByRole('listitem')).getByText('demanding')).toBeTruthy()
  await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'unrelated')
  expect(screen.getByText('Repeated words in your library:')).toBeTruthy()
  first.unmount()
  render(<VocabularyManager repository={repo} />)
  expect(await screen.findByText('Repeated words in your library:')).toBeTruthy()
})

it('finds only the chosen repeated word and can return to all words', async () => {
  const repo = repository()
  vi.mocked(repo.list).mockResolvedValue(['bank', ' BANK ', 'banking', 'other'].map((word, index) => ({ ...emptyInput, id: String(index), word, english_meaning: 'bank definition', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })))
  const user = userEvent.setup()
  render(<VocabularyManager repository={repo} />)
  await user.click(await screen.findByRole('button', { name: 'Find duplicates of bank' }))
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('button', { name: /^Word for/ })).toHaveLength(2)
  expect(within(table).queryByRole('button', { name: 'Word for banking' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Show all words' }))
  expect(within(table).getAllByRole('button', { name: /^Word for/ })).toHaveLength(4)
  await user.click(screen.getByRole('button', { name: 'Find duplicates of bank' }))
  await user.clear(screen.getByRole('searchbox', { name: 'Search' }))
  expect(within(table).getAllByRole('button', { name: /^Word for/ })).toHaveLength(4)
})
