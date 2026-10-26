import { expect, it } from 'vitest'
import { assertPublicEnvSafe, securityHeaders } from './security.ts'

it('blocks public credentials without printing their values', () => {
  for (const name of [
    'VITE_GEMINI_API_KEY',
    'VITE_TOKEN',
    'VITE_CLIENT_SECRET',
  ]) {
    expect(() => assertPublicEnvSafe({ [name]: 'sensitive-value' })).toThrow(
      name,
    )
    expect(() =>
      assertPublicEnvSafe({ [name]: 'sensitive-value' }),
    ).not.toThrow('sensitive-value')
  }
})

it('allows server credentials and public configuration', () => {
  expect(() =>
    assertPublicEnvSafe({
      GEMINI_API_KEY: 'server-only',
      VITE_APP_TITLE: 'Hub',
    }),
  ).not.toThrow()
})

it('blocks scripts, frames and connections from untrusted sources', () => {
  const csp = securityHeaders['Content-Security-Policy']
  expect(csp).toContain("script-src 'self';")
  expect(csp).toContain("connect-src 'self';")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("worker-src 'self'")
  expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff')
})
