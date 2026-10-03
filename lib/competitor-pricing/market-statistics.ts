export type MarketPricePoint = {
  key: string
  priceCents: number
}

export type MarketStatistics = {
  count: number
  minCents: number
  maxCents: number
  medianCents: number
  averageCents: number
  spreadCents: number
  currentVsMinCents: number
  currentVsMedianCents: number
}

function roundPositiveRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Expected a non-negative ratio')
  return Number((numerator + denominator / 2n) / denominator)
}

/** Positive integer mean, rounded to the nearest cent with exact halves rounded up. */
export function roundedAverageCents(prices: readonly number[]): number {
  if (prices.length === 0) throw new RangeError('At least one market price is required')
  const total = prices.reduce((sum, price) => sum + BigInt(price), 0n)
  return roundPositiveRatio(total, BigInt(prices.length))
}

/** Sorted midpoint; an even half-cent is rounded up to a whole cent. */
export function roundedMedianCents(prices: readonly number[]): number {
  if (prices.length === 0) throw new RangeError('At least one market price is required')
  const sorted = [...prices].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return roundPositiveRatio(BigInt(sorted[middle - 1]) + BigInt(sorted[middle]), 2n)
}

export function calculateMarketStatistics(prices: readonly number[], currentPriceCents: number): MarketStatistics {
  if (prices.length === 0) throw new RangeError('At least one market price is required')
  const sorted = [...prices].sort((a, b) => a - b)
  const minCents = sorted[0]
  const maxCents = sorted[sorted.length - 1]
  const medianCents = roundedMedianCents(sorted)
  return {
    count: sorted.length,
    minCents,
    maxCents,
    medianCents,
    averageCents: roundedAverageCents(sorted),
    spreadCents: maxCents - minCents,
    currentVsMinCents: currentPriceCents - minCents,
    currentVsMedianCents: currentPriceCents - medianCents,
  }
}

export type IqrFilterResult = {
  included: MarketPricePoint[]
  excluded: MarketPricePoint[]
  applied: boolean
  q1Cents: number | null
  q3Cents: number | null
  iqrCents: number | null
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Deterministic nearest-rank quartiles and Tukey fences. The multiplier is an
 * integer hundredth (1.50 => 150), so no floating-point money math is used.
 */
export function filterIqrOutliers(
  points: readonly MarketPricePoint[],
  multiplierHundredths: number,
  minPointsForFiltering: number,
): IqrFilterResult {
  const sorted = [...points].sort((a, b) => a.priceCents - b.priceCents || compareKeys(a.key, b.key))
  if (sorted.length < minPointsForFiltering || sorted.length < 4) {
    return { included: sorted, excluded: [], applied: false, q1Cents: null, q3Cents: null, iqrCents: null }
  }

  const q1Cents = sorted[Math.floor((sorted.length - 1) / 4)].priceCents
  const q3Cents = sorted[Math.floor((3 * sorted.length - 1) / 4)].priceCents
  const iqrCents = q3Cents - q1Cents
  const scale = 100n
  const multiplier = BigInt(multiplierHundredths)
  const lowerFence = BigInt(q1Cents) * scale - BigInt(iqrCents) * multiplier
  const upperFence = BigInt(q3Cents) * scale + BigInt(iqrCents) * multiplier
  const included: MarketPricePoint[] = []
  const excluded: MarketPricePoint[] = []

  for (const point of sorted) {
    const scaledPrice = BigInt(point.priceCents) * scale
    if (scaledPrice < lowerFence || scaledPrice > upperFence) excluded.push(point)
    else included.push(point)
  }

  return { included, excluded, applied: true, q1Cents, q3Cents, iqrCents }
}
