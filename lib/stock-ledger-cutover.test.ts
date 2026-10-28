import { describe, expect, it } from 'vitest'
import { buildStockLedgerCutoverReport } from './stock-ledger-cutover'

describe('stock ledger historical-order cutover report', () => {
  const products = [{ id: 'p1', externalId: 'S1', stock: 4, grinsStock: null, isDeleted: false }]

  it('never classifies or backfills historical committed/reserved orders automatically', () => {
    const orders = [
      {
        id: 'committed', createdAt: new Date('2026-10-01T10:00:00Z'), paymentStatus: 'paid',
        stockReservationStatus: 'committed', items: [{ id: 'p1', quantity: 2 }],
      },
      {
        id: 'reserved', createdAt: new Date('2026-10-02T10:00:00Z'), paymentStatus: 'pending',
        stockReservationStatus: 'reserved', items: [{ id: 'p1', quantity: 1 }],
      },
    ]

    const report = buildStockLedgerCutoverReport(products, orders, 0, true)

    expect(report.databaseWrites).toBe(0)
    expect(report.existingAllocations).toBe(0)
    expect(report.candidateOpenOrders).toHaveLength(2)
    expect(report.gate).toBe('REVIEW_EACH_ORDER_AND_BUILD_AN_EXPLICIT_UNPOSTED_ORDER_ALLOWLIST')
  })

  it('allows cutover without an order backfill only when no candidates exist', () => {
    expect(buildStockLedgerCutoverReport(products, [], 0, true).gate).toBe('NO_OPEN_ORDER_BACKFILL_REQUIRED')
  })
})
