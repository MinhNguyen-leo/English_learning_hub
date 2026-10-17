// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { VocabularyTableScroll } from './VocabularyTableScroll'

afterEach(cleanup)
it('shows the top scrollbar only when editing and synchronizes both scroll positions', () => {
  const { rerender } = render(
    <VocabularyTableScroll editing={false}>
      <table>
        <tbody>
          <tr>
            <td>word</td>
          </tr>
        </tbody>
      </table>
    </VocabularyTableScroll>,
  )
  expect(
    screen.queryByRole('region', {
      name: 'Scroll vocabulary table horizontally',
    }),
  ).toBeNull()
  rerender(
    <VocabularyTableScroll editing>
      <table>
        <tbody>
          <tr>
            <td>word</td>
          </tr>
        </tbody>
      </table>
    </VocabularyTableScroll>,
  )
  const top = screen.getByRole('region', {
    name: 'Scroll vocabulary table horizontally',
  })
  const body = screen.getByRole('region', { name: 'Vocabulary table' })
  fireEvent.scroll(top, { target: { scrollLeft: 240 } })
  expect(body.scrollLeft).toBe(240)
  fireEvent.scroll(body, { target: { scrollLeft: 80 } })
  expect(top.scrollLeft).toBe(80)
})
