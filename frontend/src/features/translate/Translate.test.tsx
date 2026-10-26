// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ApplicationDatabase } from '../../db/ApplicationDatabase'
import { IndexedDBVocabularyRepository } from '../vocabulary/repository'
import { emptyInput } from '../vocabulary/model'
import { Translate } from './Translate'
import { parseRequest, parseResult } from './model'
import i18n from '../../lib/i18n'

const entry = {
  ...emptyInput,
  word: 'reputation',
  english_meaning: 'The opinion people have.',
  vietnamese_meaning: 'Uy tín',
  part_of_speech: 'Noun',
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('validates input and rejects malformed or oversized AI entries', () => {
  expect(() => parseRequest({ text: ' ', context: '', mode: 'auto' })).toThrow()
  expect(() =>
    parseRequest({ text: 'bank', context: '', mode: 'invalid' }),
  ).toThrow()
  expect(() =>
    parseResult({ translation: 'Uy tín', entries: [{ word: 'reputation' }] }),
  ).toThrow()
  expect(() =>
    parseResult({
      translation: 'Uy tín',
      entries: [{ ...entry, word: 'x'.repeat(201) }],
    }),
  ).toThrow()
  expect(
    parseResult({ translation: 'Uy tín', entries: [entry] }).entries,
  ).toEqual([entry])
})

it('calls the API once, saves only on demand and retains the saved entry after reopening storage', async () => {
  await i18n.changeLanguage('en')
  const speak = vi.fn()
  const cancel = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      constructor(text: string) {
        this.text = text
      }
    },
  )
  const name = `translate-test-${crypto.randomUUID()}`
  const db = new ApplicationDatabase(name)
  const repository = new IndexedDBVocabularyRepository(db)
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.endsWith('/usage')
            ? {
                limit: 20,
                remaining: 20,
                resetAt: Date.now() + 86400000,
                retryAt: Date.now(),
                serverNow: Date.now(),
              }
            : { translation: 'Uy tín', entries: [entry] },
        ),
      ),
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  const onSaved = vi.fn()
  try {
    render(<Translate repository={repository} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('English text'), {
      target: { value: 'reputation' },
    })
    fireEvent.change(screen.getByLabelText('Context (optional)'), {
      target: { value: 'A university reputation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Translate & explain' }))
    await screen.findByRole('heading', { name: 'reputation' })
    expect(speak).not.toHaveBeenCalled()
    const audio = screen.getByRole('button', { name: 'Listen to reputation' })
    fireEvent.click(audio)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'reputation', lang: 'en-US', rate: 0.9 }),
    )
    speak.mockImplementationOnce(() => {
      throw new Error('Audio unavailable')
    })
    fireEvent.click(audio)
    expect(screen.getByText(/Unable to play pronunciation/)).toBeTruthy()
    expect(
      fetcher.mock.calls.filter(([url]) => url === '/api/translate'),
    ).toHaveLength(1)
    const options = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === '/api/translate')?.[1]
    expect(JSON.parse(String(options?.body))).toEqual({
      text: 'reputation',
      context: 'A university reputation',
      mode: 'auto',
    })
    expect(await repository.list()).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Vietnamese meaning'), {
      target: { value: 'Danh tiếng' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Vocab' }))
    await screen.findByRole('button', { name: 'Added to Vocab' })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(
      fetcher.mock.calls.filter(([url]) => url === '/api/translate'),
    ).toHaveLength(1)
    db.close()
    await db.open()
    expect((await repository.list())[0]?.vietnamese_meaning).toBe('Danh tiếng')
  } finally {
    cleanup()
    await db.delete()
  }
})

it('shows the remaining daily allowance and disables translation when exhausted', async () => {
  const now = Date.now()
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        limit: 20,
        remaining: 0,
        resetAt: now + 3600000,
        retryAt: now + 3600000,
        serverNow: now,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  render(
    <Translate
      repository={
        { create: vi.fn() } as unknown as IndexedDBVocabularyRepository
      }
      onSaved={vi.fn()}
    />,
  )
  await screen.findByText('0/20 translations remaining today')
  fireEvent.change(screen.getByLabelText('English text'), {
    target: { value: 'bank' },
  })
  expect(
    screen.getByRole('button', { name: 'Translate & explain' }),
  ).toHaveProperty('disabled', true)
  expect(screen.getByText(/Available again at/)).toBeTruthy()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('shows API errors without clearing the input and allows cancellation', async () => {
  const repository = {
    create: vi.fn(),
  } as unknown as IndexedDBVocabularyRepository
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'API quota reached.' }), {
        status: 429,
      }),
    ),
  )
  render(<Translate repository={repository} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('English text'), {
    target: { value: 'bank' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Translate & explain' }))
  expect((await screen.findByRole('alert')).textContent).toBe(
    'API quota reached.',
  )
  expect(screen.getByLabelText('English text')).toHaveProperty('value', 'bank')
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Translate & explain' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull(),
  )
  expect(repository.create).not.toHaveBeenCalled()
})
