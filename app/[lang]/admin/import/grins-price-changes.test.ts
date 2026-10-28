import { describe, expect, it } from 'vitest'
import type { ManualPriceChange } from '@/lib/sync/manual-import'
import { PRICE_CHANGES_PAGE_SIZE, filterPriceChanges, paginatePriceChanges } from './grins-price-changes'

const change = (index: number, localSku: string | null = null): ManualPriceChange => ({
  externalId: `GRINS-${index}`,
  localSku,
  before: '10.00',
  after: '11.00',
  percentageChange: 10,
  largeChange: false,
})

describe('GrinS Preview price-change list', () => {
  it('searches the complete list by GrinS SKU or local SKU without changing its order', () => {
    const changes = [change(1), change(2, 'LOCAL-ABC'), change(3)]
    expect(filterPriceChanges(changes, 'grins-3')).toEqual([changes[2]])
    expect(filterPriceChanges(changes, 'local-abc')).toEqual([changes[1]])
    expect(filterPriceChanges(changes, '  ')).toBe(changes)
  })

  it('limits rendered rows to one page and clamps page numbers', () => {
    const changes = Array.from({ length: PRICE_CHANGES_PAGE_SIZE + 19 }, (_, index) => change(index))
    expect(paginatePriceChanges(changes, 1)).toMatchObject({ page: 1, totalPages: 2, items: changes.slice(0, PRICE_CHANGES_PAGE_SIZE) })
    expect(paginatePriceChanges(changes, 99)).toMatchObject({ page: 2, totalPages: 2, items: changes.slice(PRICE_CHANGES_PAGE_SIZE) })
  })
})
