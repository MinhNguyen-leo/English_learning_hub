import { useUiText } from '../../lib/useUiText'
import { useId } from 'react'

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  const t = useUiText()

  const id = useId()
  return (
    <article className="dashboard-metric" aria-labelledby={id}>
      <h2 id={id}>{t(label)}</h2>
      <p className="dashboard-value">
        {typeof value === 'string' ? t(value) : value}
      </p>
      <p>{t(detail)}</p>
    </article>
  )
}
