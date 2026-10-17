import { useTranslation } from 'react-i18next'
import i18n from '../../lib/i18n'
import { useUiText } from '../../lib/useUiText'
import './language.css'

export function LanguageSwitch() {
  const { i18n: language } = useTranslation(undefined, { i18n })
  const t = useUiText()
  const vietnamese = language.resolvedLanguage === 'vi'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={vietnamese}
      aria-label={t('Use Vietnamese')}
      className="language-switch"
      onClick={() => void language.changeLanguage(vietnamese ? 'en' : 'vi')}
    >
      <span lang="vi" className={vietnamese ? 'language-active' : ''}>
        VN
      </span>
      <span className="language-track" aria-hidden="true">
        <span />
      </span>
      <span lang="en" className={!vietnamese ? 'language-active' : ''}>
        EN
      </span>
    </button>
  )
}
