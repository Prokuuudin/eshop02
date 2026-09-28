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

  it('keeps a missing active product outside scope without changing isActive', () => {
    const db = [dbProduct()]
    const report = buildSyncDryRunReport([], db, {})
    expect(report).toMatchObject({ missing: 1, wouldDeactivate: 0, deactivations: 0 })
    expect(db[0].isActive).toBe(true)
  })

  it('reports an unknown XML product as skipped and never as an insert', () => {
    const report = buildSyncDryRunReport([feedProduct()], [], {})
    expect(report).toMatchObject({ new: 0, matched: 0, unlinkedXml: 1, productInserts: 0 })
    expect(report.newProducts).toEqual([])
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

  it('is semantically idempotent after applying the predicted state', () => {
    const feed = [feedProduct({ prices: { price1: 15, price2: 12, price3: 8, price4: 6 } })]
    const predictedDb = [dbProduct({ price: 12, stock: 7 })]
    const predictedExtra = { 'SKU-1': { prices: feed[0].prices!, warehouseQuantities: feed[0].warehouseQuantities! } }
    const retry = buildSyncDryRunReport(feed, predictedDb, predictedExtra)
    expect(retry).toMatchObject({ updates: 0, productInserts: 0, externalIdAssignments: 0, erpSemanticUpdates: 0 })
    expect(retry.changes).toMatchObject({ price: { count: 0 }, stock: { count: 0 }, warehouseStock: { count: 0 } })
  })

  it('preserves an existing price and reports PRICE_TIER_ZERO_SKIPPED without fallback', () => {
    const report = buildSyncDryRunReport([feedProduct({ price: 0, prices: { price1: 99, price2: 0, price3: 88, price4: 77 } })], [dbProduct({ price: 10 })], {})
    expect(report.priceAnalysis).toMatchObject({ priceWouldChange: 0, PRICE_TIER_ZERO_SKIPPED: 1, priceWouldBecomeZero: 0 })
    expect(report.priceAnalysis.examples[0]).toMatchObject({ resultingProductPrice: 10, decision: 'PRICE_TIER_ZERO_SKIPPED' })
  })

  it('excludes a soft-deleted exact externalId claimant from all updates', () => {
    const report = buildSyncDryRunReport([feedProduct()], [dbProduct({ isDeleted: true })], {})
    expect(report).toMatchObject({ matched: 0, updates: 0, softDeletedSkipped: 1 })
  })

  it('verifies the selected stock formula independently', () => {
    const feed = feedProduct({ stock: 6, warehouseQuantities: { '10000': 1, '10001': 2, '10002': 3, '10005': 0, '10003': 99 } })
    const report = buildSyncDryRunReport([feed], [dbProduct()], {})
    expect(report.stockAnalysis.stockFormulaMismatches).toBe(0)
    expect(report.stockAnalysis.examples[0]).toMatchObject({ calculatedStock: 6, excludedWarehousesTotal: 99, correct: true })
  })
})
