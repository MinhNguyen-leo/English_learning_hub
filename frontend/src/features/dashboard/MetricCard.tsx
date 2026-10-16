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
  const id = useId()
  return (
    <article className="dashboard-metric" aria-labelledby={id}>
      <h2 id={id}>{label}</h2>
      <p className="dashboard-value">{value}</p>
      <p>{detail}</p>
    </article>
  )
}
