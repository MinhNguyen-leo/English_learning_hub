// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import type { DashboardRepository } from './repository'
import type { DashboardSnapshot } from './metrics'

afterEach(cleanup)
it('shows an empty state and explicitly unavailable SRS and historical statistics', async () => {
  const unsubscribe = vi.fn()
  const repository: DashboardRepository = {
    subscribe: (next) => {
      queueMicrotask(() =>
        next({ vocabularyIds: [], flashcards: null, quiz: null }),
      )
      return unsubscribe
    },
  }
  const { unmount } = render(<Dashboard repository={repository} />)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  await screen.findByRole('heading', {
    name: 'Start your vocabulary collection',
  })
  expect(
    within(screen.getByRole('article', { name: 'Total vocabulary' })).getByText(
      '0',
    ),
  ).toBeTruthy()
  expect(
    within(
      screen.getByRole('article', { name: 'Due for review today' }),
    ).getByText('Unavailable'),
  ).toBeTruthy()
  expect(
    within(screen.getByRole('article', { name: 'Quiz accuracy' })).getByText(
      'No answers yet',
    ),
  ).toBeTruthy()
  expect(
    screen.getByText(/Historical learning data is not available/),
  ).toBeTruthy()
  expect(screen.getByText(/No saved study sessions yet/)).toBeTruthy()
  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
it('supports retry after a read error and does not show a stale successful snapshot', async () => {
  let fail = true
  const repository: DashboardRepository = {
    subscribe: (next, error) => {
      queueMicrotask(() =>
        fail
          ? error(new Error('Storage is unavailable'))
          : next({
              vocabularyIds: ['saved-word'],
              flashcards: null,
              quiz: null,
            }),
      )
      return () => {}
    },
  }
  render(<Dashboard repository={repository} />)
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Storage is unavailable',
  )
  fail = false
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Retry dashboard' }))
  await screen.findByRole('article', { name: 'Total vocabulary' })
  expect(
    within(screen.getByRole('article', { name: 'New words' })).getByText('1'),
  ).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
it('ignores an already queued notification after unmount', async () => {
  let notify: ((snapshot: DashboardSnapshot) => void) | undefined
  const stop = vi.fn()
  const repository: DashboardRepository = {
    subscribe: (next) => {
      notify = next
      return stop
    },
  }
  const { unmount } = render(<Dashboard repository={repository} />)
  unmount()
  notify?.({ vocabularyIds: [], flashcards: null, quiz: null })
  expect(stop).toHaveBeenCalledOnce()
})
