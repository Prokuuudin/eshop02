import { describe, expect, it } from 'vitest'
import { buildLineKey, migrateCartState, type CartItem } from './cart-store'

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
  it('backfills lineKey for pre-migration cart items with no selectedVariants', () => {
    // Shape of a CartItem persisted to localStorage before lineKey existed.
    const oldItem = {
      id: 'p1',
      title: 'Old product',
      brand: 'Acme',
      price: 9.99,
      quantity: 2,
    } as Partial<CartItem> & { id: string }

    const migrated = migrateCartState({ items: [oldItem] })

    expect(migrated.items).toHaveLength(1)
    expect(migrated.items[0].lineKey).toBe('p1')
    expect(migrated.items[0].id).toBe('p1')
    expect(migrated.items[0].quantity).toBe(2)
  })

  it('backfills lineKey for old items that already carried selectedVariants', () => {
    const oldItem = {
      id: 'p1',
      title: 'Old product with variant',
      brand: 'Acme',
      price: 9.99,
      quantity: 1,
      selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11' }],
    } as Partial<CartItem> & { id: string }

    const migrated = migrateCartState({ items: [oldItem] })

    expect(migrated.items[0].lineKey).toBe('p1::Krāsu numurs=A-11')
  })

  it('leaves items that already have a lineKey untouched', () => {
    const newItem = {
      id: 'p1',
      lineKey: 'p1::Krāsu numurs=A-12',
      title: 'Already migrated',
      brand: 'Acme',
      price: 9.99,
      quantity: 1,
      selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-12' }],
    } as CartItem

    const migrated = migrateCartState({ items: [newItem] })

    expect(migrated.items[0].lineKey).toBe('p1::Krāsu numurs=A-12')
  })

  it('produces distinct lineKeys for two old-shape items sharing the same id but different variants, so remove/update no longer collide', () => {
    const itemA = { id: 'p1', title: 'A', brand: 'Acme', price: 1, quantity: 1, selectedVariants: [{ groupName: 'Izmērs', value: 'S' }] } as Partial<CartItem> & { id: string }
    const itemB = { id: 'p1', title: 'B', brand: 'Acme', price: 1, quantity: 1, selectedVariants: [{ groupName: 'Izmērs', value: 'M' }] } as Partial<CartItem> & { id: string }

    const migrated = migrateCartState({ items: [itemA, itemB] })

    expect(migrated.items[0].lineKey).not.toBe(migrated.items[1].lineKey)
  })

  it('handles missing/undefined items gracefully', () => {
    expect(migrateCartState({})).toEqual({})
    expect(migrateCartState(undefined)).toEqual(undefined)
  })
})
