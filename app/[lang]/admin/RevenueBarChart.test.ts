import { describe, expect, it } from 'vitest'
import { getRevenueChartGeometry } from './RevenueBarChart'

describe('getRevenueChartGeometry', () => {
  it('keeps an empty chart at its minimum dimensions', () => {
    expect(getRevenueChartGeometry([])).toEqual({
      max: 1,
      height: 140,
      barWidth: 36,
      gap: 524,
      width: 560,
    })
  })

  it('uses the largest revenue value as the scale', () => {
    const geometry = getRevenueChartGeometry([
      { label: '01.01', value: 25 },
      { label: '02.01', value: 80 },
    ])

    expect(geometry.max).toBe(80)
    expect(geometry.width).toBe(600)
  })

  it('expands for dense datasets while preserving readable bars', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ label: String(index), value: index }))
    const geometry = getRevenueChartGeometry(points)

    expect(geometry.barWidth).toBe(8)
    expect(geometry.gap).toBe(2)
    expect(geometry.width).toBe(1040)
  })
})
