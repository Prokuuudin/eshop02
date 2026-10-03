import { describe, expect, it } from 'vitest'
import { calculateMarketStatistics, filterIqrOutliers, roundedAverageCents, roundedMedianCents } from './market-statistics'

describe('integer market statistics', () => {
  it.each([
    [[1000], 1000, 1000],
    [[1000, 1001], 1001, 1001],
    [[1000, 1200, 1100], 1100, 1100],
    [[1000, 1001, 1002, 1003], 1002, 1002],
  ] as const)('calculates deterministic median and average for %j', (prices, median, average) => {
    expect(roundedMedianCents(prices)).toBe(median)
    expect(roundedAverageCents(prices)).toBe(average)
  })

  it('rounds exact half-cent average and median up without floating point', () => {
    expect(roundedAverageCents([1000, 1001])).toBe(1001)
    expect(roundedMedianCents([1000, 1001])).toBe(1001)
    expect(roundedAverageCents([1, 1, 2])).toBe(1)
  })

  it('reports min, max, spread and our signed deviation in cents', () => {
    expect(calculateMarketStatistics([1200, 900, 1100], 1000)).toEqual({
      count: 3,
      minCents: 900,
      maxCents: 1200,
      medianCents: 1100,
      averageCents: 1067,
      spreadCents: 300,
      currentVsMinCents: 100,
      currentVsMedianCents: -100,
    })
  })

  it('is independent of input order', () => {
    expect(calculateMarketStatistics([900, 1100, 1200, 1000], 1050))
      .toEqual(calculateMarketStatistics([1200, 900, 1000, 1100], 1050))
  })

  it('uses BigInt accumulation for Decimal(12,2)-compatible extremes', () => {
    expect(roundedAverageCents([999_999_999_999, 999_999_999_998])).toBe(999_999_999_999)
  })
})

describe('IQR outlier filtering', () => {
  const points = (prices: number[]) => prices.map((priceCents, index) => ({ key: `c${index + 1}`, priceCents }))

  it('does not filter when there are too few competitors', () => {
    expect(filterIqrOutliers(points([1000, 1000, 10_000]), 150, 4)).toMatchObject({
      applied: false,
      excluded: [],
    })
  })

  it('keeps a normal distribution', () => {
    expect(filterIqrOutliers(points([900, 1000, 1100, 1200]), 150, 4)).toMatchObject({
      applied: true,
      excluded: [],
      q1Cents: 900,
      q3Cents: 1100,
      iqrCents: 200,
    })
  })

  it('excludes an extreme high value using integer-scaled fences', () => {
    const result = filterIqrOutliers(points([1000, 1000, 1000, 10_000]), 150, 4)
    expect(result.included.map(({ priceCents }) => priceCents)).toEqual([1000, 1000, 1000])
    expect(result.excluded.map(({ priceCents }) => priceCents)).toEqual([10_000])
  })

  it('excludes an extreme low value without treating a low price as special', () => {
    const result = filterIqrOutliers(points([100, 1000, 1000, 1000, 1000]), 150, 4)
    expect(result.included.map(({ priceCents }) => priceCents)).toEqual([1000, 1000, 1000, 1000])
    expect(result.excluded.map(({ priceCents }) => priceCents)).toEqual([100])
  })
})
