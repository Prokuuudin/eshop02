import { describe, expect, it } from 'vitest'
import { buildLineKey, migrateCartState } from './cart-store'

describe('buildLineKey', () => {
  it('returns the plain id when there are no variants', () => {
    expect(buildLineKey('p1')).toBe('p1')
    expect(buildLineKey('p1', [])).toBe('p1')
  })

  it('builds a composite key from selected variants', () => {
    expect(buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }]))
      .toBe('p1::Krāsu numurs=A-11')
  })

  it('produces different keys for different variants of the same product', () => {
    const keyA = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }])
    const keyB = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-12' }])
    expect(keyA).not.toBe(keyB)
  })

  it('combines multiple groups deterministically', () => {
    const key = buildLineKey('p1', [
      { groupName: 'Krāsu numurs', value: 'A-11' },
      { groupName: 'Izmērs', value: 'M' },
    ])
    expect(key).toBe('p1::Krāsu numurs=A-11,Izmērs=M')
  })
})

describe('migrateCartState', () => {
  it('backfills lineKey for legacy items missing it', () => {
    const legacyState = { items: [{ id: 'p1', title: 'X', brand: 'B', price: 10, quantity: 1 }] }
    const migrated = migrateCartState(legacyState, 0) as { items: Array<{ id: string; lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1')
  })

  it('preserves selectedVariants when backfilling lineKey', () => {
    const legacyState = {
      items: [
        {
          id: 'p1',
          title: 'X',
          brand: 'B',
          price: 10,
          quantity: 1,
          selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11' }],
        },
      ],
    }
    const migrated = migrateCartState(legacyState, 0) as { items: Array<{ lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1::Krāsu numurs=A-11')
  })

  it('leaves items that already have a lineKey untouched', () => {
    const state = { items: [{ id: 'p1', lineKey: 'p1::custom', title: 'X', brand: 'B', price: 10, quantity: 1 }] }
    const migrated = migrateCartState(state, 1) as { items: Array<{ lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1::custom')
  })

  it('passes through a state with no items array safely', () => {
    expect(migrateCartState({}, 0)).toEqual({})
  })
})
