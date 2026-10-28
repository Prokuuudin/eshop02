import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { buildManualPriceQuery } from './manual-price-query'
import { manualDecimal } from './manual-import-validation'

describe('prices-only SQL and decimal cents', () => {
  it('has no stock/reservation/ERP warehouse write or insert', () => {
    const query = buildManualPriceQuery(2)
    expect(query).not.toMatch(/stock|warehouse|reservation|INSERT/iu)
    expect(query.split('FROM')[0]).not.toMatch(/isActive|isDeleted/iu)
    expect(query.split('FROM')[0]).toMatch(/erpPriceMissing|manualPriceApproved|manualApprovedPrice/gu)
    expect(query).toContain('p."erpPriceMissing" IS DISTINCT FROM NOT (v.price>0)')
    expect(query).toContain('round($2::numeric,2)')
  })

  it('restores ERP price state without changing manual disabling, stock or unrelated fields', async () => {
    const db = new PGlite()
    try {
      await db.exec(`CREATE TABLE "Product" (
        "externalId" text PRIMARY KEY, price numeric(12,2) NOT NULL, stock integer NOT NULL,
        "isActive" boolean NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false,
        "erpPriceMissing" boolean NOT NULL, "manualPriceApproved" boolean NOT NULL,
        "manualApprovedPrice" numeric(12,2), revision integer NOT NULL DEFAULT 1,
        "updatedAt" timestamp NOT NULL DEFAULT now(), description text, category text
      );
      INSERT INTO "Product" VALUES
        ('restored-active',10,4,true,false,true,false,NULL,1,now(),'keep-a','hair'),
        ('restored-disabled',10,6,false,false,true,false,NULL,1,now(),'keep-b','nails'),
        ('zero',9,7,true,false,false,true,9,1,now(),'keep-c','beauty'),
        ('approved',8,8,true,false,true,true,8,1,now(),'keep-d','hair');`)

      await db.query(buildManualPriceQuery(4), [
        'restored-active', '12.00',
        'restored-disabled', '12.00',
        'zero', '0.00',
        'approved', '8.00',
      ])
      const result = await db.query<Record<string, unknown>>(`SELECT "externalId",price,stock,"isActive","erpPriceMissing","manualPriceApproved","manualApprovedPrice",description,category FROM "Product" ORDER BY "externalId"`)
      const rows = new Map(result.rows.map(row => [row.externalId, row]))

      expect(rows.get('restored-active')).toMatchObject({ price: '12.00', stock: 4, isActive: true, erpPriceMissing: false, description: 'keep-a', category: 'hair' })
      expect(rows.get('restored-disabled')).toMatchObject({ price: '12.00', stock: 6, isActive: false, erpPriceMissing: false, description: 'keep-b', category: 'nails' })
      expect(rows.get('zero')).toMatchObject({ price: '9.00', stock: 7, isActive: true, erpPriceMissing: true, manualPriceApproved: true, manualApprovedPrice: '9.00' })
      expect(rows.get('approved')).toMatchObject({ price: '8.00', stock: 8, isActive: true, erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null })
    } finally {
      await db.close()
    }
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
