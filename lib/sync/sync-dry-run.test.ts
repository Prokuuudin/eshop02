import { describe, expect, it } from 'vitest'
import { buildSyncDryRunReport, type DryRunDbProduct } from './sync-dry-run'
import type { ErpProduct } from './erp-adapter'

const dbProduct = (overrides: Partial<DryRunDbProduct> = {}): DryRunDbProduct => ({
  id: 'db-1', externalId: 'SKU-1', sku: 'SKU-1', price: 10, stock: 5, isActive: true, ...overrides,
})

const feedProduct = (overrides: Partial<ErpProduct> = {}): ErpProduct => ({
  externalId: 'SKU-1', sku: 'SKU-1', title: 'SKU-1', price: 12, stock: 7,
  warehouseQuantities: { '10000': 7 }, ...overrides,
})

describe('buildSyncDryRunReport', () => {
  it('reports an existing product as an update without mutating input state', () => {
    const db = [dbProduct()]
    const before = JSON.stringify(db)
    const report = buildSyncDryRunReport([feedProduct()], db, { 'SKU-1': { prices: { price1: 0, price2: 0, price3: 0, price4: 0 }, warehouseQuantities: { '10000': 5 } } })
    expect(report).toMatchObject({ matched: 1, updates: 1, unchanged: 0 })
    expect(report.changes.price.count).toBe(1)
    expect(report.changes.stock.count).toBe(1)
    expect(report.changes.warehouseStock.count).toBe(1)
    expect(JSON.stringify(db)).toBe(before)
  })

  it('reports a missing active product as wouldDeactivate without changing isActive', () => {
    const db = [dbProduct()]
    const report = buildSyncDryRunReport([], db, {})
    expect(report).toMatchObject({ missing: 1, wouldDeactivate: 1 })
    expect(db[0].isActive).toBe(true)
  })

  it('reports a new product as pending with isActive=false', () => {
    const report = buildSyncDryRunReport([feedProduct()], [], {})
    expect(report).toMatchObject({ new: 1, matched: 0 })
    expect(report.newProducts[0]).toMatchObject({ externalId: 'SKU-1', isActive: false })
  })

  it('detects duplicate externalId and excludes it from creates', () => {
    const report = buildSyncDryRunReport([feedProduct(), feedProduct({ stock: 8 })], [], {})
    expect(report.conflicts).toBe(1)
    expect(report.duplicateExternalIds).toEqual(['SKU-1'])
    expect(report.new).toBe(0)
  })

  it('is repeatable and leaves all supplied state unchanged', () => {
    const feed = [feedProduct({ price: 10, stock: 5, warehouseQuantities: {} })]
    const db = [dbProduct()]
    const first = buildSyncDryRunReport(feed, db, {})
    const second = buildSyncDryRunReport(feed, db, {})
    expect(second).toEqual(first)
    expect(db).toEqual([dbProduct()])
  })

  it('preserves an existing price and reports PRICE_TIER_ZERO_SKIPPED without fallback', () => {
    const report = buildSyncDryRunReport([feedProduct({ price: 0, prices: { price1: 99, price2: 0, price3: 88, price4: 77 } })], [dbProduct({ price: 10 })], {})
    expect(report.priceAnalysis).toMatchObject({ priceWouldChange: 0, PRICE_TIER_ZERO_SKIPPED: 1, priceWouldBecomeZero: 0 })
    expect(report.priceAnalysis.examples[0]).toMatchObject({ resultingProductPrice: 10, decision: 'PRICE_TIER_ZERO_SKIPPED' })
  })

  it('verifies the selected stock formula independently', () => {
    const feed = feedProduct({ stock: 6, warehouseQuantities: { '10000': 1, '10001': 2, '10002': 3, '10005': 0, '10003': 99 } })
    const report = buildSyncDryRunReport([feed], [dbProduct()], {})
    expect(report.stockAnalysis.stockFormulaMismatches).toBe(0)
    expect(report.stockAnalysis.examples[0]).toMatchObject({ calculatedStock: 6, excludedWarehousesTotal: 99, correct: true })
  })
})
