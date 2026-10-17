// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {
  cleanup,
  act,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest'
import App from './App'
import { ApplicationDatabase } from '../db/ApplicationDatabase'
import { IndexedDBBackupRepository } from '../features/backup/repository'
import { fixture } from '../features/backup/testSupport'
import i18n, { languageStorageKey } from '../lib/i18n'

const db = new ApplicationDatabase()
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})
afterAll(async () => {
  await db.delete()
})
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
it('persists study preferences and reloads all mounted learning views after a confirmed restore', async () => {
  const repository = new IndexedDBBackupRepository(db)
  const original = fixture()
  await repository.restore(await repository.preview(original), 'replace', true)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Learning Dashboard' })
  const instagram = screen.getByRole('link', { name: /Instagram t_minleo/ })
  expect(instagram.getAttribute('href')).toBe(
    'https://www.instagram.com/t_minleo/',
  )
  expect(instagram.getAttribute('target')).toBe('_blank')
  expect(
    within(
      screen.getByRole('region', { name: 'Feedback to me at ins' }),
    ).getByRole('link', { name: /Instagram t_minleo/ }),
  ).toBeTruthy()
  expect(screen.getByText('Support my work')).toBeTruthy()
  expect(
    within(screen.getByRole('region', { name: 'Support my work' })).getByText(
      'Donate via QR',
    ),
  ).toBeTruthy()
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Visit streak' })).getByText(
        '1 day',
      ),
    ).toBeTruthy(),
  )
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await screen.findByRole('button', { name: 'Word for term-0' })
  expect(
    screen
      .getAllByRole('columnheader')
      .slice(0, 4)
      .map((header) => header.textContent),
  ).toEqual(['Word', 'Definition', 'Translation', 'Part of speech'])
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

it('switches the whole interface without losing vocabulary or the active draft and shows local donation QR', async () => {
  const repository = new IndexedDBBackupRepository(db)
  const original = fixture()
  await repository.restore(await repository.preview(original), 'replace', true)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Learning Dashboard' })
  await user.click(screen.getByRole('button', { name: 'Vocabulary' }))
  await screen.findByRole('button', { name: 'Word for term-0' })
  await user.click(screen.getByRole('button', { name: 'Add vocabulary' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Word' }),
    'my unsaved word',
  )
  await user.click(screen.getByRole('switch', { name: 'Use Vietnamese' }))
  expect(
    screen.getByRole('switch', { name: 'Sử dụng tiếng Việt' }),
  ).toHaveProperty('ariaChecked', 'true')
  expect(document.documentElement.lang).toBe('vi')
  expect(localStorage.getItem(languageStorageKey)).toBe('vi')
  expect(screen.getByRole('heading', { name: 'Từ vựng của tôi' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Từ' })).toHaveProperty(
    'value',
    'my unsaved word',
  )
  expect(screen.getByRole('button', { name: 'Từ của term-0' })).toHaveProperty(
    'textContent',
    'term-0',
  )
  await user.click(screen.getByRole('button', { name: 'Hướng dẫn' }))
  const tutorial = screen.getByRole('dialog', {
    name: 'Một cuốn vở từ vựng, và hơn thế nữa.',
  })
  await user.click(within(tutorial).getByRole('button', { name: 'Đến thẻ 5' }))
  expect(
    within(tutorial).getByRole('img', {
      name: 'Mã QR ủng hộ NGUYEN TIEN MINH tại VietinBank',
    }),
  ).toBeTruthy()
  await act(() => i18n.changeLanguage('en'))
  expect(
    within(tutorial).getByRole('heading', {
      name: "Here's to reaching your goal!",
    }),
  ).toBeTruthy()
  await user.click(
    within(tutorial).getByRole('button', { name: 'Close tutorial' }),
  )
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Tutorial' }),
  )
  expect(screen.getByRole('textbox', { name: 'Word' })).toHaveProperty(
    'value',
    'my unsaved word',
  )
  await user.click(screen.getByText('Donate via QR'))
  expect(
    screen.getByRole('img', {
      name: 'Donation QR for NGUYEN TIEN MINH at VietinBank',
    }),
  ).toBeTruthy()
  expect(screen.queryByText(/0933133496/)).toBeNull()
  expect((await repository.export()).data.vocabulary).toEqual(
    original.data.vocabulary,
  )
})
