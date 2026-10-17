import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useUiText } from '../../lib/useUiText'

export function VocabularyTableScroll({
  editing,
  children,
}: {
  editing: boolean
  children: ReactNode
}) {
  const t = useUiText()
  const top = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const spacer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = body.current
    if (!editing || !container) return
    const measure = () => {
      if (spacer.current)
        spacer.current.style.width = `${container.scrollWidth}px`
      if (top.current) top.current.scrollLeft = container.scrollLeft
    }
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(container)
    if (container.firstElementChild)
      observer?.observe(container.firstElementChild)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [editing])

  return (
    <>
      {editing && (
        <div
          ref={top}
          className="table-top-scroll"
          role="region"
          aria-label={t('Scroll vocabulary table horizontally')}
          tabIndex={0}
          onScroll={(event) => {
            if (
              body.current &&
              body.current.scrollLeft !== event.currentTarget.scrollLeft
            )
              body.current.scrollLeft = event.currentTarget.scrollLeft
          }}
        >
          <div ref={spacer} />
        </div>
      )}
      <div
        ref={body}
        className="table-scroll"
        role="region"
        aria-label={t('Vocabulary table')}
        tabIndex={0}
        onScroll={(event) => {
          if (
            top.current &&
            top.current.scrollLeft !== event.currentTarget.scrollLeft
          )
            top.current.scrollLeft = event.currentTarget.scrollLeft
        }}
      >
        {children}
      </div>
    </>
  )
}
