import { describe, expect, it } from 'vitest'
import { productIdsForDamagedOrderItems, repairOrderItemTitles } from './order-item-title-repair'

describe('order item title repair', () => {
  it('replaces damaged snapshot titles from the current catalog', () => {
    const items = [{ id: '10', title: 'maska ???? kauk�', price: 10.45 }, { id: '11', title: 'Clean title' }]
    const repaired = repairOrderItemTitles(items, new Map([['10', 'Маска для волос 1000мл']]))
    expect(repaired).toEqual([
      { id: '10', title: 'Маска для волос 1000мл', price: 10.45 },
      { id: '11', title: 'Clean title' },
    ])
  })

  it('collects only recoverable candidate ids and preserves unknown snapshots', () => {
    const values = [[{ id: '10', title: 'kauk�' }, { id: '11', title: 'Clean' }], null]
    expect(productIdsForDamagedOrderItems(values)).toEqual(['10'])
    expect(repairOrderItemTitles(values[0], new Map())).toEqual(values[0])
  })
})
