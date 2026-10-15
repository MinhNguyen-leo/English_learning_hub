// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  act as reactAct,
  fireEvent,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { VocabularyRepository } from '../vocabulary/repository'
import type { QuizProgressRepository, SavedQuiz } from './progressRepository'
import { generateQuiz } from './generator'
import { createQuizSession, quizTransition } from './session'
import { Quiz } from './Quiz'
import { seededRandom, vocabulary } from './testSupport'

function dependencies(initial: SavedQuiz | null = null) {
  let stored = initial
  const repository: VocabularyRepository = {
    list: vi.fn().mockResolvedValue(vocabulary(4)),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    importEntries: vi.fn(),
  }
  const progress: QuizProgressRepository = {
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (session, expected) => {
      if (expected !== (stored?.revision ?? null)) throw new Error('stale quiz')
      stored = {
        id: 'active',
        revision: (expected ?? 0) + 1,
        session: structuredClone(session),
      }
      return structuredClone(stored)
    }),
  }
  return { repository, progress }
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
async function start(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start quiz' })).toHaveProperty(
      'disabled',
      false,
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Start quiz' }))
  await screen.findByRole('region', { name: 'Quiz question' })
}
it('submits one answer, reveals the correct answer and prevents resubmission', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Quiz {...deps} />)
  await start(user)
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Next question' })).toHaveProperty(
    'disabled',
    true,
  )
  const saved = (await deps.progress.load())!
  const question = saved.session.questions[0]!
  const wrong = (question.correctIndex + 1) % 4
  await user.click(screen.getAllByRole('radio')[wrong]!)
  expect(
    await screen.findByText(
      `Not quite. Correct answer: ${question.options[question.correctIndex]}`,
    ),
  ).toBeTruthy()
  expect(
    screen
      .getAllByRole('radio')
      .every(
        (radio) =>
          (radio as HTMLInputElement).disabled ||
          radio.closest('fieldset[disabled]'),
      ),
  ).toBe(true)
  expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull()
  expect(screen.getByText(/Missed so far: 1/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Next question' }))
  expect(await screen.findByText(/Question 2 of 4/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Previous question' }))
  expect(
    await screen.findByText(
      `Not quite. Correct answer: ${question.options[question.correctIndex]}`,
    ),
  ).toBeTruthy()
})
it('restores submitted feedback and fixed option order on remount without rereading vocabulary', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  const rendered = render(<Quiz {...deps} />)
  await start(user)
  await user.click(screen.getAllByRole('radio')[0]!)
  const saved = (await deps.progress.load())!
  rendered.unmount()
  vi.mocked(deps.repository.list).mockResolvedValue([])
  render(<Quiz {...deps} />)
  await screen.findByRole('region', { name: 'Quiz question' })
  expect((await deps.progress.load())?.session).toEqual(saved.session)
  expect(
    screen.getByText(
      `Correct answer: ${saved.session.questions[0]!.options[saved.session.questions[0]!.correctIndex]}`,
      { exact: false },
    ),
  ).toBeTruthy()
  expect(deps.repository.list).toHaveBeenCalledOnce()
})
it('shows final score and missed vocabulary and persists review of completed answers', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Quiz {...deps} />)
  await start(user)
  for (let index = 0; index < 4; index++) {
    const saved = (await deps.progress.load())!
    const question = saved.session.questions[index]!
    await user.click(
      screen.getAllByRole('radio')[
        index === 0 ? (question.correctIndex + 1) % 4 : question.correctIndex
      ]!,
    )
    await user.click(
      screen.getByRole('button', {
        name: index < 3 ? 'Next question' : 'Finish quiz',
      }),
    )
  }
  const results = await screen.findByRole('region', { name: 'Quiz results' })
  expect(within(results).getByText('Score: 3 / 4')).toBeTruthy()
  expect(within(results).getByText('Missed vocabulary (1)')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Review answers' }))
  expect(await screen.findByText(/Question 1 of 4/)).toBeTruthy()
  expect(
    (await deps.progress.load())?.session.answers.filter(
      (answer) => answer !== null,
    ),
  ).toHaveLength(4)
})
it('handles insufficient vocabulary without writing an invalid quiz', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  vi.mocked(deps.repository.list).mockResolvedValue(vocabulary(3))
  render(<Quiz {...deps} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start quiz' })).toHaveProperty(
      'disabled',
      false,
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Start quiz' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Not enough')
  expect(deps.progress.save).not.toHaveBeenCalled()
})
it('keeps the selected answer and previous score after a failed save, then retries', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  render(<Quiz {...deps} />)
  await start(user)
  vi.mocked(deps.progress.save).mockRejectedValueOnce(new Error('Storage full'))
  await user.click(screen.getAllByRole('radio')[0]!)
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Storage full',
  )
  expect(screen.getAllByRole('radio')[0]).toHaveProperty('checked', true)
  expect((await deps.progress.load())?.session.answers[0]).toBeNull()
  await user.click(screen.getAllByRole('radio')[0]!)
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect((await deps.progress.load())?.session.answers[0]).toBe(0)
})
it.each([true, false])(
  'automatically advances after 1.5s for correct and 2.5s for incorrect answers (correct: %s)',
  async (correct) => {
    const deps = dependencies(),
      user = userEvent.setup()
    render(<Quiz {...deps} />)
    await start(user)
    const question = (await deps.progress.load())!.session.questions[0]!
    vi.useFakeTimers()
    await reactAct(async () => {
      fireEvent.click(
        screen.getAllByRole('radio')[
          correct ? question.correctIndex : (question.correctIndex + 1) % 4
        ]!,
      )
    })
    expect(screen.getByText(/Correct answer:/)).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: 'Thời gian còn lại trước khi tự chuyển câu',
      }),
    ).toBeTruthy()
    await reactAct(async () => {
      await vi.advanceTimersByTimeAsync((correct ? 1500 : 2500) - 1)
    })
    expect(screen.getByText(/Question 1 of 4/)).toBeTruthy()
    await reactAct(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText(/Question 2 of 4/)).toBeTruthy()
    expect(
      screen.queryByRole('img', {
        name: 'Thời gian còn lại trước khi tự chuyển câu',
      }),
    ).toBeNull()
    await reactAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Previous question' }))
    })
    await reactAct(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(screen.getByText(/Question 1 of 4/)).toBeTruthy()
  },
)
it('pauses auto-advance when leaving Quiz and resumes when returning', async () => {
  const deps = dependencies(),
    user = userEvent.setup()
  const rendered = render(<Quiz {...deps} />)
  await start(user)
  vi.useFakeTimers()
  await reactAct(async () => {
    fireEvent.click(screen.getAllByRole('radio')[0]!)
  })
  rendered.rerender(<Quiz {...deps} active={false} />)
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect((await deps.progress.load())?.session.index).toBe(0)
  rendered.rerender(<Quiz {...deps} active={true} />)
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(screen.getByText(/Question 2 of 4/)).toBeTruthy()
})
it('automatically shows results after the feedback delay for the final answer', async () => {
  let session = createQuizSession(
    generateQuiz(vocabulary(4), 10, seededRandom(42)),
    10,
  )
  for (let index = 0; index < 3; index++) {
    session = quizTransition(session, { type: 'submit', choice: 0 })
    session = quizTransition(session, { type: 'next' })
  }
  const deps = dependencies({ id: 'active', revision: 1, session })
  render(<Quiz {...deps} />)
  await screen.findByRole('region', { name: 'Quiz question' })
  vi.useFakeTimers()
  await reactAct(async () => {
    fireEvent.click(screen.getAllByRole('radio')[0]!)
  })
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(screen.getByRole('region', { name: 'Quiz results' })).toBeTruthy()
  expect((await deps.progress.load())?.session.finished).toBe(true)
})
it('reloads saved progress after a storage read error and starts only with explicit replacement consent', async () => {
  const initial: SavedQuiz = {
    id: 'active',
    revision: 1,
    session: createQuizSession(
      generateQuiz(vocabulary(4), 10, seededRandom(42)),
      10,
    ),
  }
  const deps = dependencies(initial),
    user = userEvent.setup()
  vi.mocked(deps.progress.load).mockRejectedValueOnce(
    new Error('Storage denied'),
  )
  render(<Quiz {...deps} />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start quiz' })).toHaveProperty(
    'disabled',
    true,
  )
  await user.click(screen.getByRole('button', { name: 'Reload saved quiz' }))
  await screen.findByRole('region', { name: 'Quiz question' })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Start new quiz' }))
  expect(deps.progress.save).not.toHaveBeenCalled()
  expect((await deps.progress.load())?.session).toEqual(initial.session)
})
