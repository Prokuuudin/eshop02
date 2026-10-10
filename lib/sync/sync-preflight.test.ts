import { describe, expect, it } from 'vitest'
import type { ErpProduct } from './erp-adapter'
import type { GrinsXmlAudit } from './grins-xml-parser'
import { evaluatePreflight, structuralFailures, toCents, type LinkedProductState, type PreflightInput } from './sync-preflight'

const ROWS = 16_000
const LINKED = 15_600

function cleanAudit(itemCount = ROWS): GrinsXmlAudit {
  return {
    validXml: true, itemCount, uniqueSkus: itemCount, emptySkus: 0,
    duplicateSkus: [], duplicateExternalIds: [], whitespaceSkus: [], caseCollisionGroups: [], leadingZeroSkus: [],
    invalidPrices: [], negativePrices: [], invalidStocks: [], negativeStocks: [],
    warehouseIndexes: [], warehouseIds: [], missingWarehouseIndexes: [], unexpectedWarehouseIndexes: [],
  }
}

function product(index: number, overrides: Partial<ErpProduct> = {}): ErpProduct {
  const inStock = index % 5 === 0
  return {
    externalId: `e${index}`, title: `e${index}`, price: 10, stock: inStock ? 5 : 0,
    prices: { price1: 12, price2: 10, price3: 9, price4: 8 },
    warehouseQuantities: inStock ? { 10000: 2, 10001: 1, 10002: 1, 10005: 1, 10010: 0 } : { 10000: 0, 10001: 0, 10002: 0, 10005: 0, 10010: 0 },
    ...overrides,
  }
}

/** Baseline shaped like production: 97.5% linked, 80% stock=0, DB already equal to the feed. */
function baseline(): PreflightInput {
  const products = Array.from({ length: ROWS }, (_, index) => product(index))
  const linkedProducts: LinkedProductState[] = products.slice(0, LINKED).map((row, index) => ({
    externalId: row.externalId, price: '10.00', stock: row.stock, isActive: index % 10 === 0, isDeleted: false,
    erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null,
  }))
  return { audit: cleanAudit(), products, linkedProducts, previousProductsTotal: ROWS }
}

function mapProducts(input: PreflightInput, fn: (row: ErpProduct, index: number) => ErpProduct): PreflightInput {
  return { ...input, products: input.products.map(fn) }
}

describe('evaluatePreflight', () => {
  it('passes the production-shaped baseline without HARD failures or warnings', () => {
    const result = evaluatePreflight(baseline())
    expect(result.hard).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.metrics).toMatchObject({ rows: ROWS, linked: LINKED, unlinked: 400, priceChanged: 0, activeZeroed: 0 })
  })

  it('blocks invalid XML and every structural failure', () => {
    const input = baseline()
    expect(evaluatePreflight({ ...input, audit: { ...cleanAudit(), validXml: false, validationError: 'bad' } }).hard).toContain('invalid XML: bad')
    for (const audit of [
      { emptySkus: 2 }, { duplicateExternalIds: ['a'], duplicateSkus: ['a'] },
      { invalidPrices: [{ sku: 'a', field: 'price2', value: 'x' }] }, { invalidStocks: [{ sku: 'a', field: 'w1', value: 'x' }] },
      { missingWarehouseIndexes: ['3'] }, { unexpectedWarehouseIndexes: ['12'] },
    ]) {
      expect(evaluatePreflight({ ...input, audit: { ...cleanAudit(), ...audit } }).hard).toHaveLength(1)
    }
  })

  it('blocks an empty feed', () => {
    const result = evaluatePreflight({ ...baseline(), audit: cleanAudit(0), products: [] })
    expect(result.hard).toContain('XML contains no products')
  })

  it('blocks a feed below 90% of the previous completed run', () => {
    const input = baseline()
    const result = evaluatePreflight({ ...input, previousProductsTotal: Math.ceil(ROWS / 0.89) })
    expect(result.hard.some(item => item.startsWith('feed shrank'))).toBe(true)
  })

  it('blocks a feed above 120% of the previous completed run', () => {
    const result = evaluatePreflight({ ...baseline(), previousProductsTotal: 13_000 })
    expect(result.hard.some(item => item.startsWith('feed grew'))).toBe(true)
  })

  it('blocks a feed below the 14000 absolute floor even if the previous run was small', () => {
    const input = baseline()
    const products = input.products.slice(0, 13_900)
    const result = evaluatePreflight({ ...input, products, audit: cleanAudit(13_900), previousProductsTotal: 13_900 })
    expect(result.hard.some(item => item.includes('absolute minimum 14000'))).toBe(true)
  })

  it('fails closed when there is no previous completed FULL run', () => {
    const result = evaluatePreflight({ ...baseline(), previousProductsTotal: null })
    expect(result.hard.some(item => item.startsWith('no previous completed FULL SyncRun'))).toBe(true)
  })

  it('blocks a linked ratio below 90%', () => {
    const input = baseline()
    const result = evaluatePreflight({ ...input, linkedProducts: input.linkedProducts.slice(0, 14_000) })
    expect(result.hard.some(item => item.startsWith('linked ratio'))).toBe(true)
  })

  it('blocks a linked stock sum drop of more than 30%', () => {
    const input = mapProducts(baseline(), (row, index) => (index % 10 === 5 && row.stock > 0 ? { ...row, stock: 0 } : row))
    // half of the in-stock rows (non-active ones) drop to zero → -50% sum, active untouched
    const result = evaluatePreflight(input)
    expect(result.hard.some(item => item.startsWith('linked stock sum drops'))).toBe(true)
  })

  it('blocks a linked stock sum growth above 3x', () => {
    const result = evaluatePreflight(mapProducts(baseline(), row => (row.stock > 0 ? { ...row, stock: 20 } : row)))
    expect(result.hard.some(item => item.startsWith('linked stock sum grows'))).toBe(true)
  })

  it('blocks when more than 25% of active in-stock Products drop to zero', () => {
    const input = baseline()
    const activeInStock = input.linkedProducts.filter(row => row.isActive && row.stock > 0).map(row => row.externalId)
    const zeroed = new Set(activeInStock.slice(0, Math.ceil(activeInStock.length * 0.3)))
    // give the stock back elsewhere so only the active-zeroing rule fires
    const result = evaluatePreflight(mapProducts(input, row => (zeroed.has(row.externalId) ? { ...row, stock: 0 } : row.stock > 0 ? { ...row, stock: 6 } : row)))
    expect(result.hard.some(item => item.includes('active in-stock Products would drop to stock 0'))).toBe(true)
    expect(result.hard.some(item => item.startsWith('linked stock sum'))).toBe(false)
  })

  it('blocks when stock=0 exceeds 95% of linked rows', () => {
    const input = mapProducts(baseline(), (row, index) => (index % 50 === 0 ? { ...row, stock: 500 } : { ...row, stock: 0 }))
    const result = evaluatePreflight(input)
    expect(result.hard.some(item => item.startsWith('stock=0 for'))).toBe(true)
  })

  it('blocks when an included warehouse has no non-zero row, but ignores 10010', () => {
    const input = mapProducts(baseline(), row => ({ ...row, warehouseQuantities: { ...row.warehouseQuantities, 10002: 0 } }))
    const result = evaluatePreflight(input)
    expect(result.hard).toContain('included warehouse 10002 has no row with non-zero stock')
    expect(result.hard.some(item => item.includes('10010'))).toBe(false)
  })

  it('blocks when price2=0 exceeds 15% of XML rows', () => {
    const result = evaluatePreflight(mapProducts(baseline(), (row, index) => (index % 6 === 0 ? { ...row, price: 0 } : row)))
    expect(result.hard.some(item => item.startsWith('price2=0 for'))).toBe(true)
  })

  it('never counts price2=0 as a price change (existing price is preserved)', () => {
    const result = evaluatePreflight(mapProducts(baseline(), (row, index) => (index % 20 === 0 ? { ...row, price: 0 } : row)))
    expect(result.metrics.priceChanged).toBe(0)
    expect(result.hard).toEqual([])
  })

  it('blocks when more than 10% of linked prices change', () => {
    const result = evaluatePreflight(mapProducts(baseline(), (row, index) => (index % 8 === 0 ? { ...row, price: 11 } : row)))
    expect(result.hard.some(item => item.includes('linked prices change'))).toBe(true)
  })

  it('compares prices cent-exactly, not with float equality', () => {
    const input = baseline()
    input.linkedProducts[0] = { ...input.linkedProducts[0], price: '0.30' }
    input.products[0] = { ...input.products[0], price: 0.1 + 0.2 }
    expect(evaluatePreflight(input).metrics.priceChanged).toBe(0)
  })

  it('emits warnings without blocking', () => {
    const input = baseline()
    input.linkedProducts.push({ externalId: 'gone', price: '5.00', stock: 3, isActive: true, isDeleted: false, erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null })
    input.products[1] = { ...input.products[1], price: 2500 }
    input.products[2] = { ...input.products[2], price: 30 }
    const result = evaluatePreflight({ ...input, previousProductsTotal: 16_500 })
    expect(result.hard).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('feed size drift'),
      expect.stringContaining('linked Products are missing from XML'),
      expect.stringContaining('change by more than'),
      expect.stringContaining('exceed 2000 EUR'),
    ]))
  })
})

describe('structuralFailures', () => {
  it('returns nothing for a clean audit', () => {
    expect(structuralFailures(cleanAudit())).toEqual([])
  })
})

describe('toCents', () => {
  it('parses numeric text and numbers with half-up rounding', () => {
    expect(toCents('10.00')).toBe(1000)
    expect(toCents('7.6')).toBe(760)
    expect(toCents(7.6)).toBe(760)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents('1.005')).toBe(101)
    expect(toCents('0')).toBe(0)
  })
})
