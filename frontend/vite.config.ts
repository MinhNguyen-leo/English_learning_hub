import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { translationPlugin } from './server/translate.ts'
import { assertPublicEnvSafe, securityHeaders } from './server/security.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  assertPublicEnvSafe(env)
  return {
    plugins: [react(), tailwindcss(), translationPlugin(env)],
    preview: { headers: securityHeaders },
    server: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
    },
  }
})
