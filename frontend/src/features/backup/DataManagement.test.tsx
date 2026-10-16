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
import { fixture } from './testSupport'
import { DataManagement } from './DataManagement'
import type { BackupRepository } from './repository'

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
    },
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function dependencies() {
  const backup = fixture()
  const repository: BackupRepository = {
    export: vi.fn(async () => structuredClone(backup)),
    preview: vi.fn(async (incoming) => ({
      backup: incoming,
      current: structuredClone(backup.data),
      generation: 0,
    })),
    restore: vi.fn(async () => {}),
  }
  const onRestored = vi.fn(async () => {})
  return { repository, onRestored }
}
function file(text = JSON.stringify(fixture())) {
  const value = new File([text], 'backup.json', { type: 'application/json' })
  // jsdom File lacks Blob.text; the browser uses the real File implementation.
  Object.defineProperty(value, 'text', { value: async () => text })
  return value
}
it('validates the selected file, previews counts and merges only after the user clicks Restore', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  render(<DataManagement {...deps} />)
  await user.upload(screen.getByLabelText(/Choose a JSON backup/), file())
  await screen.findByRole('heading', { name: 'Restore preview' })
  expect(
    screen.getByText(
      /Vocabulary entries: 5 incoming, 5 local, 0 conflicting IDs/,
    ),
  ).toBeTruthy()
  expect(deps.repository.restore).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Restore with Merge' }))
  await screen.findByText(/Full backup restored/)
  expect(deps.repository.restore).toHaveBeenCalledWith(
    expect.objectContaining({ generation: 0 }),
    'merge',
    false,
  )
  expect(deps.onRestored).toHaveBeenCalledOnce()
})
it('requires a separate explicit confirmation before Replace and supports cancelling it', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  render(<DataManagement {...deps} />)
  await user.upload(screen.getByLabelText(/Choose a JSON backup/), file())
  await screen.findByRole('heading', { name: 'Restore preview' })
  await user.click(screen.getByRole('radio', { name: /Replace —/ }))
  await user.click(
    screen.getByRole('button', { name: 'Review Replace confirmation' }),
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Replace all local data?',
  })
  expect(deps.repository.restore).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(deps.repository.restore).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Review Replace confirmation' }),
  )
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Replace all local data',
    }),
  )
  await screen.findByText(/Full backup restored/)
  expect(deps.repository.restore).toHaveBeenCalledWith(
    expect.anything(),
    'replace',
    true,
  )
})
it('rejects a malformed file before requesting a preview or allowing restore', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  render(<DataManagement {...deps} />)
  await user.upload(
    screen.getByLabelText(/Choose a JSON backup/),
    file('{broken'),
  )
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Malformed JSON',
  )
  expect(deps.repository.preview).not.toHaveBeenCalled()
  expect(deps.repository.restore).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Restore preview' })).toBeNull()
})
it('keeps the preview and reports restore errors without claiming success or reloading screens', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  vi.mocked(deps.repository.restore).mockRejectedValueOnce(
    new Error('Local data changed since preview.'),
  )
  render(<DataManagement {...deps} />)
  await user.upload(screen.getByLabelText(/Choose a JSON backup/), file())
  await screen.findByRole('heading', { name: 'Restore preview' })
  await user.click(screen.getByRole('button', { name: 'Restore with Merge' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'changed since preview',
  )
  expect(screen.getByRole('heading', { name: 'Restore preview' })).toBeTruthy()
  expect(deps.onRestored).not.toHaveBeenCalled()
})
it('reports a committed restore separately if refreshing screens fails', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  deps.onRestored.mockRejectedValueOnce(new Error('read failed'))
  render(<DataManagement {...deps} />)
  await user.upload(screen.getByLabelText(/Choose a JSON backup/), file())
  await screen.findByRole('heading', { name: 'Restore preview' })
  await user.click(screen.getByRole('button', { name: 'Restore with Merge' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Restore was committed',
  )
  expect(screen.queryByRole('heading', { name: 'Restore preview' })).toBeNull()
})
it('downloads a full JSON backup and warns that browser data can be lost', async () => {
  const deps = dependencies()
  const user = userEvent.setup()
  const create = vi.fn((blob: Blob) => {
    expect(blob.type).toBe('application/json;charset=utf-8')
    return 'blob:backup'
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: create,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
  const clicked = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^english-learning-hub-.*\.json$/)
      expect(this.href).toBe('blob:backup')
    })
  render(<DataManagement {...deps} />)
  expect(screen.getByText('Browser data can be lost.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Export Full Backup' }))
  await screen.findByText(/Full backup download started/)
  expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
  expect(clicked).toHaveBeenCalledOnce()
  expect(deps.repository.restore).not.toHaveBeenCalled()
})
it('refreshes storage counts on returning to Data Management', async () => {
  const deps = dependencies()
  const { rerender } = render(<DataManagement {...deps} active={false} />)
  expect(deps.repository.export).not.toHaveBeenCalled()
  rerender(<DataManagement {...deps} active />)
  await waitFor(() => expect(deps.repository.export).toHaveBeenCalledOnce())
})
