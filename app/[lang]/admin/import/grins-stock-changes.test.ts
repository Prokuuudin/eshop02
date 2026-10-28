import { describe, expect, it } from 'vitest'
import type { ManualStockChange } from '@/lib/sync/manual-stock-preview'
import { COLLAPSED_STOCK_CHANGES, STOCK_CHANGES_PAGE_SIZE, filterStockChanges, paginateStockChanges } from './grins-stock-changes'

const change = (externalId: string, localSku: string | null = null): ManualStockChange => ({
  externalId, localSku, currentStock: 1, incomingStock: 2, delta: 1,
  percentageChange: 100, largeDifference: true, zeroTransition: null,
})

describe('stock Preview list helpers', () => {
  it('keeps the collapsed list at ten rows', () => {
    expect(COLLAPSED_STOCK_CHANGES).toBe(10)
  })

  it('searches both GrinS and local SKU case-insensitively', () => {
    const rows = [change('GRINS-ONE', 'LOCAL-A'), change('GRINS-TWO', 'LOCAL-B')]
    expect(filterStockChanges(rows, 'two')).toEqual([rows[1]])
    expect(filterStockChanges(rows, 'local-a')).toEqual([rows[0]])
  })

  it('paginates the expanded result without rendering an unbounded table', () => {
    const rows = Array.from({ length: STOCK_CHANGES_PAGE_SIZE + 1 }, (_, index) => change(`G-${index}`))
    expect(paginateStockChanges(rows, 1).items).toHaveLength(STOCK_CHANGES_PAGE_SIZE)
    expect(paginateStockChanges(rows, 2)).toMatchObject({ page: 2, totalPages: 2, items: [rows.at(-1)] })
  })
})
