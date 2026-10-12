import { describe, expect, it, vi } from 'vitest'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { evaluateStockPreview } from './manual-stock-preview'

function item(sku: string, warehouses: number[], quantity = warehouses.reduce((sum, value) => sum + value, 0)): string {
  return `<item><sku>${sku}</sku><price1>x</price1><price2>x</price2><price3>x</price3><price4>x</price4><quantity>${quantity}</quantity><warehouses>${warehouses.map((value, index) => `<warehouse id="${index + 1}">${value}</warehouse>`).join('')}</warehouses></item>`
}

const xml = (...items: string[]) => `<root>${items.join('')}</root>`

function dbWith(rows: Array<{ externalId: string; sku: string | null; stock: number; isDeleted: boolean }>): ExtendedPrismaClient {
  return {
    product: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as ExtendedPrismaClient
}

describe('read-only GrinS stock Preview', () => {
  it('uses exact externalId matching and the shared selected-warehouse formula', async () => {
    const db = dbWith([
      { externalId: 'G-1', sku: 'LOCAL-1', stock: 4, isDeleted: false },
      { externalId: 'g-2', sku: null, stock: 9, isDeleted: false },
      { externalId: 'DELETED', sku: null, stock: 1, isDeleted: true },
    ])
    const result = await evaluateStockPreview(db, xml(
      item('G-1', [1, 2, 3, 100, 100, 4, 100, 100, 100]),
      item('G-2', [1, 1, 1, 0, 0, 1, 0, 0, 0]),
      item('DELETED', [1, 0, 0, 0, 0, 0, 0, 0, 0]),
    ))

    expect(result.hard).toEqual([])
    expect(result.summary).toMatchObject({ rows: 3, matched: 1, skipped: 2, unlinked: 1, softDeletedSkipped: 1 })
    expect(result.changes).toEqual([expect.objectContaining({
      externalId: 'G-1', localSku: 'LOCAL-1', currentStock: 4, incomingStock: 10, delta: 6,
    })])
    expect(result.samples.unlinked).toEqual(['G-2'])
  })

  it('counts increases, decreases, zero transitions and strictly-over-50% differences', async () => {
    const db = dbWith([
      { externalId: 'UP', sku: null, stock: 4, isDeleted: false },
      { externalId: 'DOWN', sku: null, stock: 10, isDeleted: false },
      { externalId: 'FROM-ZERO', sku: null, stock: 0, isDeleted: false },
      { externalId: 'EXACT-50', sku: null, stock: 10, isDeleted: false },
      { externalId: 'SAME', sku: null, stock: 3, isDeleted: false },
    ])
    const result = await evaluateStockPreview(db, xml(
      item('UP', [10, 0, 0, 0, 0, 0, 0, 0, 0]),
      item('DOWN', [0, 0, 0, 0, 0, 0, 0, 0, 0]),
      item('FROM-ZERO', [5, 0, 0, 0, 0, 0, 0, 0, 0]),
      item('EXACT-50', [5, 0, 0, 0, 0, 0, 0, 0, 0]),
      item('SAME', [3, 0, 0, 0, 0, 0, 0, 0, 0]),
    ))

    expect(result.summary).toMatchObject({
      matched: 5, unchanged: 1, stockChanges: 4, increases: 2, decreases: 2,
      zeroTransitions: 2, toZero: 1, fromZero: 1, largeDifferences: 2,
    })
    expect(result.changes.find(change => change.externalId === 'EXACT-50')?.largeDifference).toBe(false)
    expect(result.changes.find(change => change.externalId === 'FROM-ZERO')).toMatchObject({
      percentageChange: null, largeDifference: false, zeroTransition: 'from-zero',
    })
  })

  it('fails closed on invalid or negative stock without producing comparisons', async () => {
    const result = await evaluateStockPreview(dbWith([]), xml(
      item('NEGATIVE', [-1, 0, 0, 0, 0, 0, 0, 0, 0], 0),
    ))
    expect(result.hard).toContain('1 negative stock values')
    expect(result.summary.negativeValues).toBe(1)
    expect(result.changes).toEqual([])
  })

  it('performs no DB operation other than Product.findMany', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const db = { product: { findMany } } as unknown as ExtendedPrismaClient
    await evaluateStockPreview(db, xml(item('UNLINKED', [0, 0, 0, 0, 0, 0, 0, 0, 0])))
    expect(findMany).toHaveBeenCalledOnce()
    expect(Object.keys(db)).toEqual(['product'])
  })
})
