// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Tutorial } from './Tutorial'

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
  vi.unstubAllGlobals()
  Reflect.deleteProperty(Element.prototype, 'animate')
})

it('keeps one accessible card, replaces interrupted flights, and removes finished snapshots', async () => {
  const finishes: (() => void)[] = []
  const cancel = vi.fn()
  const animate = vi.fn(() => ({
    finished: new Promise<void>((resolve) => finishes.push(resolve)),
    cancel,
  }))
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: animate,
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const user = userEvent.setup()
  const { container, unmount } = render(<Tutorial onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(2)
  const snapshot = container.querySelector(
    '.tutorial-card-leaving',
  ) as HTMLElement
  expect(snapshot.inert).toBe(true)
  expect(snapshot.getAttribute('aria-hidden')).toBe('true')
  const ids = [...container.querySelectorAll('[id]')].map((node) => node.id)
  expect(new Set(ids).size).toBe(ids.length)
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  expect(cancel).toHaveBeenCalledTimes(2)
  expect(container.querySelectorAll('.tutorial-card-leaving')).toHaveLength(1)
  await act(async () => {
    finishes[2]?.()
    finishes[3]?.()
  })
  expect(container.querySelector('.tutorial-card-leaving')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  const calls = cancel.mock.calls.length
  unmount()
  expect(cancel).toHaveBeenCalledTimes(calls + 2)
})

it('changes cards immediately without animation when reduced motion is requested', async () => {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: animate,
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const user = userEvent.setup()
  render(<Tutorial onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  expect(
    screen
      .getByRole('button', { name: 'Go to card 2' })
      .getAttribute('aria-current'),
  ).toBe('step')
  expect(animate).not.toHaveBeenCalled()
  expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(1)
})
