type RevenuePoint = { label: string; value: number }
type RevenueChartGeometry = {
  max: number
  height: number
  barWidth: number
  gap: number
  width: number
}

export function getRevenueChartGeometry(data: RevenuePoint[]): RevenueChartGeometry {
  const max = Math.max(...data.map((point) => point.value), 1)
  const height = 140
  const barWidth = Math.max(8, Math.min(36, Math.floor(560 / Math.max(data.length, 1)) - 4))
  const gap = Math.max(2, Math.floor(560 / Math.max(data.length, 1)) - barWidth)
  const width = Math.max(560, data.length * (barWidth + gap) + 40)
  return { max, height, barWidth, gap, width }
}

export default function RevenueBarChart({ data, locale }: { data: RevenuePoint[]; locale: string }): React.ReactElement {
  const { max, height, barWidth, gap, width } = getRevenueChartGeometry(data)

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height + 48} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = 8 + (height - 8) * (1 - fraction)
          return (
            <g key={fraction}>
              <line x1={32} x2={width - 8} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={28} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                {fraction === 0 ? '0' : `€${Math.round(max * fraction).toLocaleString(locale)}`}
              </text>
            </g>
          )
        })}
        {data.map((point, index) => {
          const barHeight = Math.max(2, (point.value / max) * (height - 16))
          const x = 32 + index * (barWidth + gap)
          const y = height - barHeight + 8
          return (
            <g key={`${point.label}-${index}`}>
              <title>€{point.value.toLocaleString(locale, { minimumFractionDigits: 2 })}</title>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill="#6366f1" opacity={0.85} />
              <text
                x={x + barWidth / 2}
                y={height + 24}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
                transform={data.length > 10 ? `rotate(-35,${x + barWidth / 2},${height + 24})` : undefined}
              >
                {point.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
