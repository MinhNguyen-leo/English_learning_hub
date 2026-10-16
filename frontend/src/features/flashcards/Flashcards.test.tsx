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
import { emptyInput, type Vocabulary } from '../vocabulary/model'
import type { VocabularyRepository } from '../vocabulary/repository'
import type {
  ReviewProgressRepository,
  SavedSession,
} from './progressRepository'
import { createSession } from './session'
import { Flashcards } from './Flashcards'

const words: Vocabulary[] = Array.from({ length: 3 }, (_, index) => ({
  ...emptyInput,
  id: `word-${index}`,
  word: `word ${index}`,
  english_meaning: `meaning ${index}`,
  vietnamese_meaning: 'xin chào',
  part_of_speech: 'noun',
  example_sentence: `Example ${index}`,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}))
function dependencies(initial: SavedSession | null = null) {
  let stored = initial
  const repository: VocabularyRepository = {
    list: vi.fn().mockResolvedValue(structuredClone(words)),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    importEntries: vi.fn(),
  }
  const progress: ReviewProgressRepository = {
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (session, revision) => {
      if (revision !== (stored?.revision ?? null))
        throw new Error('stale progress')
      stored = {
        id: 'active',
        revision: (revision ?? 0) + 1,
        session: structuredClone(session),
      }
      return structuredClone(stored)
    }),
  }
  return { repository, progress }
}
beforeEach(() => {
  // jsdom does not implement native dialog modal behavior.
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
async function start(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Start session' }),
    ).toHaveProperty('disabled', false),
  )
  await user.click(screen.getByRole('button', { name: 'Start session' }))
  await screen.findByRole('article', { name: 'Card front' })
}
it('lets Space activate a focused review button instead of flipping the card', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  screen.getByRole('button', { name: 'Not remembered' }).focus()
  await user.keyboard(' ')
  await waitFor(() =>
    expect(vi.mocked(deps.progress.save).mock.calls.length).toBe(2),
  )
  expect((await deps.progress.load())?.session.reviews).toHaveLength(1)
  expect(screen.getByRole('article', { name: 'Card front' })).toBeTruthy()
})
it('starts an optional review session with saved mistakes first, without repeating words', async () => {
  const session = createSession(words, 'all', () => 0.9)
  session.reviews = [{ id: session.cards[2]!.id, status: 'not-remembered' }]
  const deps = dependencies({ id: 'active', revision: 1, session }),
    user = userEvent.setup()
  vi.mocked(deps.repository.list).mockResolvedValue([
    ...words,
    { ...words[0]!, id: 'duplicate', word: ' WORD 0 ' },
  ])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<Flashcards {...deps} />)
  await screen.findByRole('article')
  expect(screen.getByLabelText('Study mode')).toHaveProperty('value', 'random')
  await user.selectOptions(screen.getByLabelText('Study mode'), 'review')
  await user.click(screen.getByRole('button', { name: 'Start new session' }))
  await waitFor(() => expect(screen.getByText('Card 1 of 3')).toBeTruthy())
  const stored = (await deps.progress.load())!
  expect(stored.revision).toBe(2)
  expect(stored.session.cards[0]!.word).toBe(session.cards[2]!.word)
  expect(stored.session.reviews).toEqual([])
})
it('places navigation inside the card and supports Space and arrow keys without flipping twice', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  const article = screen.getByRole('article')
  expect(within(article).getByRole('button', { name: 'Previous' })).toBeTruthy()
  expect(within(article).getByRole('button', { name: 'Next' })).toBeTruthy()
  article.focus()
  const saves = vi.mocked(deps.progress.save).mock.calls.length
  await user.keyboard(' ')
  expect(await screen.findByRole('article', { name: 'Card back' })).toBeTruthy()
  expect(deps.progress.save).toHaveBeenCalledTimes(saves + 1)
  await user.keyboard('{ArrowRight}')
  expect(await screen.findByText('Card 2 of 3')).toBeTruthy()
  expect(screen.getByRole('article', { name: 'Card front' })).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('article'))
  await user.keyboard('{ArrowLeft}')
  expect(await screen.findByText('Card 1 of 3')).toBeTruthy()
  await user.click(
    within(screen.getByRole('article')).getByRole('button', { name: 'Next' }),
  )
  expect(await screen.findByText('Card 2 of 3')).toBeTruthy()
  expect(screen.getByRole('article', { name: 'Card front' })).toBeTruthy()
})
it('ignores shortcuts in form controls and when the flashcard view is hidden', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  const { container } = render(<Flashcards {...deps} />)
  await start(user)
  const calls = vi.mocked(deps.progress.save).mock.calls.length
  await user.click(screen.getByLabelText('Session size'))
  await user.keyboard(' {ArrowRight}{ArrowLeft}')
  expect(deps.progress.save).toHaveBeenCalledTimes(calls)
  const root = screen.getByRole('main')
  const input = document.createElement('input')
  root.append(input)
  input.focus()
  await user.keyboard(' {ArrowRight}{ArrowLeft}')
  expect(deps.progress.save).toHaveBeenCalledTimes(calls)
  input.remove()
  container.hidden = true
  document.body.focus()
  await user.keyboard(' {ArrowRight}{ArrowLeft}')
  expect(deps.progress.save).toHaveBeenCalledTimes(calls)
})
it('flips to show all requested fields, tracks review changes, and navigates the same snapshot', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  expect(screen.getByText(/Fewer than 20/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty(
    'disabled',
    true,
  )
  const frontWord = within(screen.getByRole('article')).getByRole(
    'heading',
  ).textContent
  expect(
    screen.getByText('xin chào').closest('[aria-hidden="true"]'),
  ).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Flip card' }))
  const back = await screen.findByRole('article', { name: 'Card back' })
  expect(within(back).getByText('xin chào')).toBeTruthy()
  expect(within(back).getByText('English meaning')).toBeTruthy()
  expect(within(back).getByText('Noun')).toBeTruthy()
  expect(within(back).getByText(/Example \d/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Remembered' }))
  expect(
    await screen.findByText(/Remembered: 1 · Not remembered: 0/),
  ).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Not remembered' }))
  expect(
    await screen.findByText(/Remembered: 0 · Not remembered: 1/),
  ).toBeTruthy()
  vi.mocked(deps.repository.list).mockResolvedValue([])
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('article', { name: 'Card front' })
  expect(screen.getByText('Card 2 of 3')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Previous' }))
  expect(await screen.findByText('Card 1 of 3')).toBeTruthy()
  expect(
    within(screen.getByRole('article')).getByRole('heading'),
  ).toHaveProperty('textContent', frontWord)
  expect(
    screen
      .getByRole('button', { name: 'Not remembered' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  expect(deps.repository.list).toHaveBeenCalledTimes(2)
})
it('resumes position, card side and review marks on remount instead of resampling', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  const rendered = render(<Flashcards {...deps} />)
  await start(user)
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Remembered' }))
  await user.click(screen.getByRole('button', { name: 'Flip card' }))
  const heading = within(
    await screen.findByRole('article', { name: 'Card back' }),
  ).getByRole('heading').textContent
  rendered.unmount()
  vi.mocked(deps.repository.list).mockResolvedValue([])
  render(<Flashcards {...deps} />)
  const back = await screen.findByRole('article', { name: 'Card back' })
  expect(within(back).getByRole('heading')).toHaveProperty(
    'textContent',
    heading,
  )
  expect(screen.getByText('Card 2 of 3')).toBeTruthy()
  expect(
    screen
      .getByRole('button', { name: 'Remembered' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
})
it('keeps the selected set during shuffle and restart, requiring confirmation to clear marks', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  const initial = (await deps.progress.load())!.session.cards
    .map((card) => card.id)
    .sort()
  await user.click(screen.getByRole('button', { name: 'Remembered' }))
  await user.click(
    screen.getByRole('button', { name: 'Shuffle current cards' }),
  )
  expect(
    (await deps.progress.load())?.session.cards.map((card) => card.id).sort(),
  ).toEqual(initial)
  expect(screen.getByText(/Remembered: 1 ·/)).toBeTruthy()
  await user.click(
    screen.getByRole('button', { name: 'Restart current cards' }),
  )
  const popup = screen.getByRole('dialog', { name: 'Bắt đầu lại bộ thẻ?' })
  await user.keyboard(' {ArrowRight}')
  expect((await deps.progress.load())?.session.index).toBe(0)
  await user.click(within(popup).getByRole('button', { name: 'Hủy' }))
  expect((await deps.progress.load())?.session.reviews).toHaveLength(1)
  await user.click(
    screen.getByRole('button', { name: 'Restart current cards' }),
  )
  await user.click(screen.getByRole('button', { name: 'Bắt đầu lại' }))
  expect((await deps.progress.load())?.session.reviews).toHaveLength(0)
  expect(
    (await deps.progress.load())?.session.cards.map((card) => card.id).sort(),
  ).toEqual(initial)
  expect(deps.repository.list).toHaveBeenCalledTimes(2)
})
it('keeps the restart popup and review marks when saving fails, then allows retry', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  await user.click(screen.getByRole('button', { name: 'Remembered' }))
  await user.click(
    screen.getByRole('button', { name: 'Restart current cards' }),
  )
  vi.mocked(deps.progress.save).mockRejectedValueOnce(new Error('Storage full'))
  await user.click(screen.getByRole('button', { name: 'Bắt đầu lại' }))
  const popup = screen.getByRole('dialog', { name: 'Bắt đầu lại bộ thẻ?' })
  expect(await within(popup).findByRole('alert')).toHaveProperty(
    'textContent',
    'Storage full',
  )
  expect((await deps.progress.load())?.session.reviews).toHaveLength(1)
  await user.click(within(popup).getByRole('button', { name: 'Bắt đầu lại' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await deps.progress.load())?.session.reviews).toHaveLength(0)
})
it('retains the last committed card after a save failure and allows retry', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  vi.mocked(deps.progress.save).mockRejectedValueOnce(
    new Error('Storage full; action was not saved'),
  )
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Storage full; action was not saved',
  )
  expect(screen.getByText('Card 1 of 3')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Card 2 of 3')).toBeTruthy()
})
it('handles empty libraries and recovers from progress-loading errors without overwriting saved data', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  vi.mocked(deps.repository.list).mockResolvedValue([])
  vi.mocked(deps.progress.load).mockRejectedValueOnce(
    new Error('Storage unavailable'),
  )
  render(<Flashcards {...deps} />)
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Storage unavailable',
  )
  expect(screen.getByRole('button', { name: 'Start session' })).toHaveProperty(
    'disabled',
    true,
  )
  expect(deps.progress.save).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Reload saved progress' }),
  )
  vi.mocked(deps.repository.list).mockResolvedValue(words)
  await user.click(
    screen.getByRole('button', { name: 'Refresh available words' }),
  )
  await start(user)
  expect(screen.getByText('Card 1 of 3')).toBeTruthy()
})
it('uses a fresh repository sample only when explicitly starting a new session', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Flashcards {...deps} />)
  await start(user)
  const fresh = [{ ...words[0]!, id: 'fresh', word: 'fresh word' }]
  vi.mocked(deps.repository.list).mockResolvedValue(fresh)
  await user.selectOptions(screen.getByLabelText('Session size'), 'all')
  await user.click(
    screen.getByRole('button', { name: 'Refresh available words' }),
  )
  expect(screen.getByText('Card 1 of 3')).toBeTruthy()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Start new session' }))
  expect(await screen.findByText('Card 1 of 1')).toBeTruthy()
  expect(
    within(screen.getByRole('article')).getByRole('heading'),
  ).toHaveProperty('textContent', 'fresh word')
})
it('can use a saved single-card session when the vocabulary repository is unavailable', async () => {
  const deps = dependencies({
    id: 'active',
    revision: 1,
    session: createSession(words.slice(0, 1), 50),
  })
  vi.mocked(deps.repository.list).mockRejectedValue(new Error('Read failed'))
  render(<Flashcards {...deps} />)
  expect(
    await screen.findByRole('article', { name: 'Card front' }),
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty(
    'disabled',
    true,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Remembered' }))
  expect(await screen.findByText(/All cards reviewed/)).toBeTruthy()
})
