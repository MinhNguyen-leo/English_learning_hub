import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import vi from './locales/vi.json'

// Retained status/error messages stay in their source language in state. Match
// interpolated messages at the display boundary so switching also updates them.
const patterns = Object.keys(vi)
  .filter((key) => key.includes('{{'))
  .map((key) => {
    const names: string[] = []
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = escaped.replace(
      /\\\{\\\{(\w+)\\\}\\\}/g,
      (_, name: string) => {
        names.push(name)
        return '(.*?)'
      },
    )
    return { key, names, regex: new RegExp(`^${pattern}$`, 's') }
  })

export function useUiText() {
  const { t } = useTranslation(undefined, { i18n })
  return useCallback(
    (key: string | undefined, values?: Record<string, unknown>): string => {
      if (!key) return ''
      if (values || i18n.exists(key)) return String(t(key, values ?? {}))
      for (const pattern of patterns) {
        const match = pattern.regex.exec(key)
        if (match) {
          return String(
            t(
              pattern.key,
              Object.fromEntries(
                pattern.names.map((name, index) => [name, match[index + 1]]),
              ),
            ),
          )
        }
      }
      return key
    },
    [t],
  )
}
