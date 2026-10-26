import { readFileSync } from 'node:fs'

// Reuse the production policy for preview so it can be checked before deployment.
export const securityHeaders = Object.fromEntries(
  readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const colon = line.indexOf(':')
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
    }),
)

export function assertPublicEnvSafe(env: Record<string, string | undefined>) {
  const unsafe = Object.keys(env).filter(
    (name) =>
      name.startsWith('VITE_') &&
      /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE)/i.test(name) &&
      Boolean(env[name]),
  )
  if (unsafe.length)
    throw new Error(
      `Client-exposed secrets are forbidden: ${unsafe.join(', ')}. Remove VITE_ and keep credentials on the server.`,
    )
}
