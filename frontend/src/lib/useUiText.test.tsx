// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n, { languageStorageKey } from './i18n'
import { useUiText } from './useUiText'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

it('updates retained messages and interpolation when language changes', async () => {
  const { result } = renderHook(() => useUiText())
  expect(result.current('Exported 12 entries.')).toBe('Exported 12 entries.')
  await act(() => i18n.changeLanguage('vi'))
  expect(result.current('Exported 12 entries.')).toBe('Đã xuất 12 mục từ.')
  expect(result.current('Delete {{value0}}', { value0: 'curious' })).toBe(
    'Xóa curious',
  )
  expect(result.current('Word is required.')).toBe('Vui lòng nhập từ.')
  expect(document.documentElement.lang).toBe('vi')
  expect(localStorage.getItem(languageStorageKey)).toBe('vi')
  expect(result.current('Chúc bạn sớm đạt aim!')).toBe('Chúc bạn sớm đạt aim!')
  await act(() => i18n.changeLanguage('en'))
  expect(result.current('Chúc bạn sớm đạt aim!')).toBe(
    "Here's to reaching your goal!",
  )
})

it('switches languages when local storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError')
  })
  const { result } = renderHook(() => useUiText())
  await act(() => i18n.changeLanguage('vi'))
  expect(result.current('Vocabulary')).toBe('Từ vựng')
})
