import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import vi from './locales/vi.json'
import en from './locales/en.json'

export const languageStorageKey = 'english-hub-language'
export type Language = 'en' | 'vi'

function savedLanguage(): Language {
  try {
    return localStorage.getItem(languageStorageKey) === 'vi' ? 'vi' : 'en'
  } catch {
    return 'en'
  }
}

function updateDocument(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        ...Object.fromEntries(Object.keys(vi).map((key) => [key, key])),
        ...en,
      },
    },
    vi: {
      translation: {
        ...Object.fromEntries(Object.keys(en).map((key) => [key, key])),
        ...vi,
      },
    },
  },
  lng: savedLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'vi'],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
})
updateDocument(i18n.language)
i18n.on('languageChanged', (language) => {
  updateDocument(language)
  try {
    localStorage.setItem(languageStorageKey, language)
  } catch {
    // Language switching still works when browser storage is unavailable.
  }
})

export default i18n
