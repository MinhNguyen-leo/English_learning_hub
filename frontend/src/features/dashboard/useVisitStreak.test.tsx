// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVisitStreak } from './useVisitStreak'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('records visits on mount, at local midnight and when returning to the website', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 16, 23, 59, 59))
  const recordVisit = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(2)
  const repository = { recordVisit }
  const { result, unmount } = renderHook(() => useVisitStreak(repository))
  // Keep the repository identity stable across state updates.
  async function flush() {
    await act(async () => {})
  }
  await flush()
  expect(result.current.days).toBe(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100)
  })
  expect(result.current.days).toBe(2)
  expect(recordVisit).toHaveBeenCalledTimes(2)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(recordVisit).toHaveBeenCalledTimes(3)
  unmount()
  await vi.advanceTimersByTimeAsync(86_400_000)
  window.dispatchEvent(new Event('focus'))
  expect(recordVisit).toHaveBeenCalledTimes(3)
})

it('shows a storage error and recovers when retried', async () => {
  const recordVisit = vi
    .fn()
    .mockRejectedValueOnce(new Error('Storage denied'))
    .mockResolvedValue(4)
  const repository = { recordVisit }
  const { result } = renderHook(() => useVisitStreak(repository))
  await act(async () => {})
  expect(result.current.days).toBeNull()
  expect(result.current.error).toContain('Could not save your streak')
  await act(async () => {
    result.current.retry()
  })
  expect(result.current.days).toBe(4)
  expect(result.current.error).toBe('')
})
