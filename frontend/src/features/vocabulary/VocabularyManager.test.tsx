// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
      await user.type(screen.getByLabelText('English meaning'), 'greeting')
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
      await user.type(screen.getByLabelText('English meaning'), 'greeting')
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
  await user.type(screen.getByLabelText('English meaning'), 'river side')
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
