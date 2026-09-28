import { describe, expect, it } from 'vitest'
import { allowedStock, classifyPriceReview, excludedStock, priceStockCell } from './final-remaining-audit'

describe('final remaining XML audit rules', () => {
  it('uses only the four allowed warehouses and clamps negatives', () => {
    const warehouses = { '10000': 2, '10001': -4, '10003': 9, '10005': 3 }
    expect(allowedStock(warehouses)).toBe(5)
    expect(excludedStock(warehouses)).toBe(9)
  })

  it('builds the four price/stock cells', () => {
    expect([priceStockCell(1, 1), priceStockCell(1, 0), priceStockCell(0, 1), priceStockCell(0, 0)]).toEqual(['A', 'B', 'C', 'D'])
  })

  it('does not turn a statistical outlier into a semantic error', () => {
    expect(classifyPriceReview({ price2Raw: '599', price1: 599, price2: 599, price3: 0, price4: 0, outlierLow: 0, outlierHigh: 30 })).toMatchObject({ classification: 'PRICE_VALID_BUT_STATISTICAL_OUTLIER', technicallyExactImportable: true })
  })

  it('keeps excessive precision in manual review', () => {
    expect(classifyPriceReview({ price2Raw: '7.8166', price1: 8, price2: 7.8166, price3: 5, price4: 0, outlierLow: 0, outlierHigh: 30 })).toMatchObject({ classification: 'PRICE_FORMAT_REQUIRES_REVIEW', technicallyExactImportable: false })
  })
})
