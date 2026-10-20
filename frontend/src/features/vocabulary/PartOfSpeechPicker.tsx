import { useUiText } from '../../lib/useUiText'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './part-of-speech.css'

const options = [
  'Noun',
  'Verb',
  'Adjective',
  'Adverb',
  'Pronoun',
  'Preposition',
  'Conjunction',
  'Interjection',
  'Other',
]
export function PartOfSpeechBadge({ value }: { value: string }) {
  const t = useUiText()

  return (
    <span
      className={`pos-badge pos-${options.find((option) => option.toLowerCase() === value.trim().toLowerCase())?.toLowerCase() ?? 'other'}`}
    >
      {t(
        options.find(
          (option) => option.toLowerCase() === value.trim().toLowerCase(),
        ),
      ) || value}
    </span>
  )
}
export function PartOfSpeechPicker({
  value,
  onChange,
  onSave,
  disabled,
  autoFocus,
  title,
  error,
}: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  disabled: boolean
  autoFocus: boolean
  title: string | undefined
  error: string | undefined
}) {
  const t = useUiText()

  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 220,
    maxHeight: 360,
  })
  const matches = options.filter(
    (option) =>
      option.toLowerCase().includes(query.trim().toLowerCase()) ||
      t(option).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const choices = [
    ...matches.map((label) => ({ label, value: label.toLowerCase() })),
    ...(query.trim() &&
    !options.some(
      (option) => option.toLowerCase() === query.trim().toLowerCase(),
    )
      ? [
          {
            label: t('Use “{{value0}}”', { value0: query.trim() }),
            value: query.trim(),
          },
        ]
      : []),
    { label: 'Clear', value: '' },
  ]
  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const height = Math.min(360, Math.max(below, above))
      const width = Math.min(Math.max(220, rect.width), window.innerWidth - 16)
      setPosition({
        top:
          below >= height
            ? rect.bottom + 4
            : Math.max(8, rect.top - height - 4),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: height,
      })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])
  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }
  return (
    <div className="pos-picker">
      <input
        ref={input}
        role="combobox"
        aria-label={t('Part of speech')}
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && !disabled ? `${id}-${active}` : undefined
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'error-part_of_speech' : undefined}
        aria-keyshortcuts="Shift+Enter"
        autoFocus={autoFocus}
        disabled={disabled}
        title={title}
        value={open ? query : value}
        placeholder={
          open ? t('Search parts of speech…') : t('Choose part of speech')
        }
        maxLength={200}
        onFocus={() => {
          setQuery('')
          setActive(0)
          setOpen(true)
        }}
        onClick={() => {
          if (!open) {
            setQuery('')
            setActive(0)
            setOpen(true)
          }
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value)
          onChange(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault()
            setOpen(false)
            onSave()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActive(
              (previous) =>
                (previous +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  choices.length) %
                choices.length,
            )
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            const choice = choices[active]
            if (choice) choose(choice.value)
          } else if (event.key === 'Escape' || event.key === 'Tab')
            setOpen(false)
        }}
      />
      {!open && value && <PartOfSpeechBadge value={value} />}
      <span className="pos-picker-chevron" aria-hidden="true">
        ⌄
      </span>
      {open &&
        !disabled &&
        createPortal(
          <div
            className="pos-menu"
            role="listbox"
            aria-label={t('Parts of speech')}
            id={id}
            style={{ position: 'fixed', ...position }}
          >
            {choices.map((choice, index) => (
              <div
                role="option"
                id={`${id}-${index}`}
                key={choice.value}
                aria-selected={
                  value.trim().toLowerCase() === choice.value.toLowerCase()
                }
                className={`pos-option ${active === index ? 'pos-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(choice.value)}
              >
                {choice.value ? (
                  <PartOfSpeechBadge
                    value={
                      options.some(
                        (option) => option.toLowerCase() === choice.value,
                      )
                        ? choice.value
                        : choice.label
                    }
                  />
                ) : (
                  <span>{t('Clear')}</span>
                )}
                {value.trim().toLowerCase() === choice.value.toLowerCase() && (
                  <span aria-hidden="true">✓</span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
