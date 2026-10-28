import { describe, expect, it } from 'vitest'
import { GRINS_WAREHOUSE_INDEX_TO_ID, grinsWarehouseIdForIndex } from './grins-warehouse-map'

describe('GRINS_WAREHOUSE_INDEX_TO_ID', () => {
  it('has exactly 9 entries, one per XML warehouse index', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).toHaveLength(9)
  })

  it('maps ids 1..8 to 10000..10007 (proven from the legacy exporter, 2026-10-05)', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID.slice(0, 8)).toEqual([
      '10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007',
    ])
  })

  it('maps id 9 to nothing: it is an unused slot (legacy 10009, Hairshop Pro 0), never Jelgava 10010', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID[8]).toBeNull()
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).not.toContain('10010')
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).not.toContain('10009')
  })

  it('resolves 1-based indexes and returns null outside 1..8', () => {
    expect(grinsWarehouseIdForIndex(1)).toBe('10000')
    expect(grinsWarehouseIdForIndex(8)).toBe('10007')
    expect(grinsWarehouseIdForIndex(9)).toBeNull()
    expect(grinsWarehouseIdForIndex(0)).toBeNull()
    expect(grinsWarehouseIdForIndex(10)).toBeNull()
  })
})
