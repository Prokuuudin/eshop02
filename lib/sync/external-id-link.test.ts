import { describe, expect, it } from 'vitest'
import { buildExternalIdLinkUpdate, erpPriceMissingForLink } from './external-id-link'

describe('externalId linking sets the ERP price state atomically', () => {
  it('treats only a positive finite primary price as present (fail closed otherwise)', () => {
    expect(erpPriceMissingForLink(7.3)).toBe(false)
    expect(erpPriceMissingForLink(0)).toBe(true)
    expect(erpPriceMissingForLink(-1)).toBe(true)
    expect(erpPriceMissingForLink(Number.NaN)).toBe(true)
    expect(erpPriceMissingForLink(undefined)).toBe(true)
    expect(erpPriceMissingForLink(null)).toBe(true)
  })

  it('writes price2, the flag and a cleared approval in the same UPDATE as the link', () => {
    const { sql, params } = buildExternalIdLinkUpdate([
      { productId: 'p1', externalId: 'SDO3', erpPrimaryPrice: 7.3 },
      { productId: 'p2', externalId: 'BLK', erpPrimaryPrice: 0 },
      { productId: 'p3', externalId: 'X', erpPrimaryPrice: undefined },
    ])
    expect(sql).toMatch(/SET "externalId" = v\.external_id/)
    expect(sql).toContain('price = CASE WHEN v.price_missing THEN p.price ELSE v.erp_price END')
    expect(sql).toContain('"erpPriceMissing" = v.price_missing')
    expect(sql).toContain('"manualPriceApproved" = false')
    expect(sql).toContain('"manualApprovedPrice" = NULL')
    expect(params).toEqual([['p1', 'p2', 'p3'], ['SDO3', 'BLK', 'X'], [false, true, true], [7.3, null, null]])
  })

  it('never relinks an already linked product and never inserts', () => {
    const { sql } = buildExternalIdLinkUpdate([{ productId: 'p1', externalId: 'SDO3', erpPrimaryPrice: 7.3 }])
    expect(sql).toContain('p."externalId" IS NULL')
    expect(sql).not.toMatch(/\bINSERT\b/i)
  })
})
