import { describe, expect, it } from 'vitest'
import { auditStockXml } from './manual-stock-preview'
import { parseGrinsXml } from './grins-xml-parser'
import { evaluateStockSyncPreflight } from './stock-sync-preflight'

const warehouses = Array.from({ length: 9 }, (_, index) => `<warehouse id="${index + 1}">${index < 3 ? 1 : 0}</warehouse>`).join('')
const item = (sku: string, stock = 1) => `<item><sku>${sku}</sku><price1>x</price1><price2>x</price2><price3>x</price3><price4>x</price4><quantity>${stock}</quantity><warehouses>${warehouses}</warehouses></item>`

describe('stocks-only preflight', () => {
  it('ignores price validity but keeps strict stock/XML gates', () => {
    const xml = `<root>${item('A')}</root>`
    const audit = auditStockXml(xml)
    expect(audit.invalidPrices).toEqual([])
    const products = parseGrinsXml(xml)
    const result = evaluateStockSyncPreflight(audit, products, [{
      id: 'p1', externalId: 'A', stock: 2, grinsStock: null, isActive: true, isDeleted: false,
    }], null)
    expect(result.metrics.matched).toBe(1)
    expect(result.hard).toContain('feed has 1 rows (< absolute minimum 14000)')
  })

  it('compares snapshots to physical grinsStock, not derived availability', () => {
    const xml = `<root>${item('A')}</root>`
    const products = parseGrinsXml(xml)
    const result = evaluateStockSyncPreflight(auditStockXml(xml), products, [{
      id: 'p1', externalId: 'A', stock: 1, grinsStock: 3, isActive: true, isDeleted: false,
    }], 1)
    expect(result.metrics.currentPhysicalSum).toBe(3)
    expect(result.metrics.incomingPhysicalSum).toBe(3)
  })
})
