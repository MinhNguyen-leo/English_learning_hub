import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { TranslationLimits, positiveSetting } from './translationLimits.ts'

it('enforces cooldown across devices on one IP, cookie allowance and midnight reset', () => {
  let now = Date.parse('2026-10-23T16:59:30Z')
  const limits = new TranslationLimits(
    ':memory:',
    { TRANSLATE_DAILY_LIMIT: '2' },
    () => now,
  )
  try {
    expect(limits.consume('a', 'ip').allowed).toBe(true)
    expect(limits.consume('b', 'ip').allowed).toBe(false)
    now += 10000
    expect(limits.consume('a', 'ip').usage.remaining).toBe(0)
    now += 10000
    expect(limits.consume('a', 'ip').allowed).toBe(false)
    now = Date.parse('2026-10-23T17:00:00Z')
    expect(limits.get('a', 'ip').remaining).toBe(2)
    expect(limits.consume('a', 'ip').allowed).toBe(true)
  } finally {
    limits.close()
  }
})

it('blocks new cookies at the IP allowance and new IPs at the global allowance', () => {
  let now = Date.now()
  const limits = new TranslationLimits(
    ':memory:',
    { TRANSLATE_IP_DAILY_LIMIT: '1', TRANSLATE_GLOBAL_DAILY_LIMIT: '2' },
    () => now,
  )
  try {
    expect(limits.consume('a', 'ip1').allowed).toBe(true)
    now += 10000
    expect(limits.consume('new-cookie', 'ip1').allowed).toBe(false)
    expect(limits.consume('b', 'ip2').allowed).toBe(true)
    expect(limits.consume('c', 'ip3').allowed).toBe(false)
  } finally {
    limits.close()
  }
})

it('persists counters and cookie signatures across reopening, and rejects tampered cookies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'translate-quota-'))
  let limits = new TranslationLimits(join(directory, 'limits.sqlite'), {
    TRANSLATE_DAILY_LIMIT: '1',
  })
  try {
    const device = limits.device(undefined)
    expect(limits.consume(device.id, 'ip').allowed).toBe(true)
    limits.close()
    limits = new TranslationLimits(join(directory, 'limits.sqlite'), {
      TRANSLATE_DAILY_LIMIT: '1',
    })
    expect(limits.device(device.cookie!).id).toBe(device.id)
    expect(limits.get(device.id, 'ip').remaining).toBe(0)
    expect(
      limits.device(
        device.cookie!.replace(
          device.id,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).id,
    ).not.toBe(device.id)
  } finally {
    limits.close()
    rmSync(directory, { recursive: true })
  }
})

it('rejects invalid limit configuration instead of silently disabling controls', () => {
  for (const value of ['0', '-1', '1.5', 'no-limit'])
    expect(() => positiveSetting(value, 20)).toThrow()
})
