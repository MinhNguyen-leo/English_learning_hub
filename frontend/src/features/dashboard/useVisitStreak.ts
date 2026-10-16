import { useEffect, useState } from 'react'
import type { StreakRepository } from './streakRepository'

export interface VisitStreak {
  days: number | null
  error: string
  retry: () => void
}

export function useVisitStreak(repository: StreakRepository): VisitStreak {
  const [days, setDays] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function record() {
      try {
        const value = await repository.recordVisit()
        if (active) {
          setDays(value)
          setError('')
        }
      } catch {
        if (active)
          setError(
            'Could not save your streak. Check browser storage and retry.',
          )
      }
    }
    function refresh() {
      if (document.visibilityState === 'hidden') return
      void record()
      clearTimeout(timer)
      const now = new Date()
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      )
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 100)
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [repository, attempt])
  return { days, error, retry: () => setAttempt((value) => value + 1) }
}
