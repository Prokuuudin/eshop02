import { describe, expect, it } from 'vitest'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from './grins-warehouse-map'

describe('GRINS_WAREHOUSE_INDEX_TO_ID', () => {
  it('has exactly 9 entries, one per XML warehouse index', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).toHaveLength(9)
  })

  it('maps index 1 (Centrāla noliktava) to 10000 and index 9 (Jelgava) to 10010, confirmed 2026-07-30', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID[0]).toBe('10000')
    expect(GRINS_WAREHOUSE_INDEX_TO_ID[8]).toBe('10010')
  })

  it('matches the full confirmed order', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).toEqual([
      '10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10010',
    ])
  })
})
