// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { PartOfSpeechPicker } from './PartOfSpeechPicker'
afterEach(cleanup)
it('supports keyboard search, selection, Escape, custom values and clearing', async () => {
  const onChange = vi.fn(),
    onSave = vi.fn()
  render(
    <PartOfSpeechPicker
      value="custom existing"
      onChange={onChange}
      onSave={onSave}
      disabled={false}
      autoFocus={false}
      title={undefined}
      error={undefined}
    />,
  )
  const user = userEvent.setup(),
    input = screen.getByRole('combobox')
  expect(input).toHaveProperty('value', 'custom existing')
  await user.click(input)
  await user.type(input, 'interj')
  await user.keyboard('{Enter}')
  expect(onChange).toHaveBeenLastCalledWith('interjection')
  expect(onSave).not.toHaveBeenCalled()
  await user.click(input)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('listbox')).toBeNull()
  await user.click(input)
  await user.type(input, 'phrasal verb')
  await user.click(screen.getByRole('option', { name: /Use/ }))
  expect(onChange).toHaveBeenLastCalledWith('phrasal verb')
  await user.click(input)
  await user.click(screen.getByRole('option', { name: 'Clear' }))
  expect(onChange).toHaveBeenLastCalledWith('')
})
it('exposes the selected option and prevents changes while disabled', async () => {
  const onChange = vi.fn()
  const { rerender } = render(
    <PartOfSpeechPicker
      value="noun"
      onChange={onChange}
      onSave={vi.fn()}
      disabled={false}
      autoFocus={false}
      title="Added: yesterday"
      error={undefined}
    />,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox'))
  expect(
    screen.getByRole('option', { name: 'Noun' }).getAttribute('aria-selected'),
  ).toBe('true')
  await user.keyboard('{ArrowDown}{Enter}')
  expect(onChange).toHaveBeenLastCalledWith('verb')
  rerender(
    <PartOfSpeechPicker
      value="noun"
      onChange={onChange}
      onSave={vi.fn()}
      disabled={true}
      autoFocus={false}
      title={undefined}
      error={undefined}
    />,
  )
  expect(screen.getByRole('combobox')).toHaveProperty('disabled', true)
})
