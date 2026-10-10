import { describe, expect, it } from 'vitest'
import { buildManualPriceQuery } from './manual-price-query'
import { manualDecimal } from './manual-import-validation'

describe('prices-only SQL and decimal cents', () => {
  it('has no stock/reservation/ERP warehouse write or insert', () => {
    const query = buildManualPriceQuery(2)
    expect(query).not.toMatch(/stock|warehouse|reservation|INSERT/iu)
    expect(query.split('FROM')[0]).not.toMatch(/isActive|isDeleted/iu)
    expect(query.split('FROM')[0]).not.toMatch(/erpPriceMissing|manualPriceApproved|manualApprovedPrice/iu)
    expect(query).toContain('AND v.price>0 AND p.price IS DISTINCT FROM v.price')
    expect(query).toContain('round($2::numeric,2)')
  })
  it.each(['0.004', '0.0049', '0.0000001', '0x10', '1e2', '10000000000', '-1', 'NaN'])('rejects unsafe price %s', price => {
    expect(manualDecimal(price)).toBeNull()
  })
  it('normalizes half-up cents and preserves literal zero policy', () => {
    expect(manualDecimal('0.005')).toBe(0.01)
    expect(manualDecimal('1.005')).toBe(1.01)
    expect(manualDecimal('1.0049999')).toBe(1)
    expect(manualDecimal('0')).toBe(0)
    expect(manualDecimal('9999999999.995')).toBeNull()
  })
})
