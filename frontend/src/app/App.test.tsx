// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import App from './App'
import { ApplicationDatabase } from '../db/ApplicationDatabase'
import { IndexedDBBackupRepository } from '../features/backup/repository'
import { fixture } from '../features/backup/testSupport'

const db = new ApplicationDatabase()
afterEach(async () => {
  cleanup()
  await db.delete()
})
it('persists study preferences and reloads all mounted learning views after a confirmed restore', async () => {
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
  const repository = new IndexedDBBackupRepository(db)
  const original = fixture()
  await repository.restore(await repository.preview(original), 'replace', true)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Learning Dashboard' })
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await screen.findByRole('button', { name: 'Word for term-0' })
  await user.click(screen.getByRole('button', { name: 'Flashcards' }))
  const size = await screen.findByRole('combobox', { name: 'Session size' })
  await waitFor(() => expect(size).toHaveProperty('value', 'all'))
  await user.selectOptions(size, '50')
  await waitFor(async () =>
    expect((await db.settings.get('preferences'))?.flashcardSize).toBe(50),
  )
  await user.click(screen.getByRole('button', { name: 'Quiz' }))
  const quizSize = await screen.findByRole('combobox', { name: 'Quiz size' })
  expect(quizSize).toHaveProperty('value', '50')
  await user.selectOptions(quizSize, '20')
  await waitFor(async () =>
    expect((await db.settings.get('preferences'))?.quizSize).toBe(20),
  )
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Word' }),
    'unsaved draft',
  )
  await user.click(screen.getByRole('button', { name: 'Data Management' }))
  const incoming = fixture()
  incoming.data.vocabulary[0]!.word = 'restored-term-0'
  incoming.data.settings[0]!.flashcardSize = 20
  incoming.data.settings[0]!.quizSize = 10
  const text = JSON.stringify(incoming)
  const file = new File([text], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => text })
  await user.upload(screen.getByLabelText(/Choose a JSON backup/), file)
  await screen.findByRole('heading', { name: 'Restore preview' })
  await user.click(screen.getByRole('radio', { name: /Replace —/ }))
  await user.click(
    screen.getByRole('button', { name: 'Review Replace confirmation' }),
  )
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Replace all local data',
    }),
  )
  await screen.findByText(/Full backup restored/)
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await screen.findByRole('button', { name: 'Word for restored-term-0' })
  expect(screen.queryByRole('textbox', { name: 'Word' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Word for term-0' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Flashcards' }))
  expect(
    await screen.findByRole('combobox', { name: 'Session size' }),
  ).toHaveProperty('value', '20')
  await user.click(screen.getByRole('button', { name: 'Quiz' }))
  expect(
    await screen.findByRole('combobox', { name: 'Quiz size' }),
  ).toHaveProperty('value', '10')
  await user.click(screen.getByRole('button', { name: 'Dashboard' }))
  const count = await screen.findByRole('article', { name: 'Total vocabulary' })
  expect(within(count).getByText('5')).toBeTruthy()
  expect(
    within(screen.getByRole('article', { name: 'Quiz accuracy' })).getByText(
      '0.0%',
    ),
  ).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await screen.findByRole('button', { name: 'Word for restored-term-0' })
  expect((await repository.export()).data).toEqual(incoming.data)
}, 15000)
