import { describe, expect, it } from 'vitest'
import { buildErpPriceMissingUpdate } from './erp-price-missing-backfill'

describe('erpPriceMissing backfill write', () => {
  it('writes only erpPriceMissing — never an implicit updatedAt stamp', () => {
    const { sql } = buildErpPriceMissingUpdate(['p1'], true)
    const setClause = sql.split('WHERE')[0]
    expect(setClause).toMatch(/SET "erpPriceMissing" = \$2\s*$/)
    expect(sql).not.toMatch(/updatedAt/i)
    expect(sql).not.toMatch(/\bprice\b|stock|"isActive"|"externalId"|"manualPriceApproved"|"manualApprovedPrice"/)
  })

  it('only flips rows still in the expected state and never touches deleted products', () => {
    expect(buildErpPriceMissingUpdate(['p1', 'p2'], true).params).toEqual([['p1', 'p2'], true, false])
    expect(buildErpPriceMissingUpdate(['p3'], false).params).toEqual([['p3'], false, true])
    const { sql } = buildErpPriceMissingUpdate(['p1'], true)
    expect(sql).toContain('"erpPriceMissing" = $3')
    expect(sql).toContain('"isDeleted" = false')
    expect(sql).not.toMatch(/\bINSERT\b|\bDELETE\b/i)
  })
})
