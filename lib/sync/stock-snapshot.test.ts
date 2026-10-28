import { describe, expect, it } from 'vitest'
import { isRetryableStockTransactionError, snapshotIsAfterAcknowledgment } from './stock-snapshot'

describe('stock snapshot causality', () => {
  const acknowledgment = new Date('2026-10-12T10:00:00.000Z')

  it('requires runStartedAt to be strictly after acknowledgment plus skew', () => {
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T10:05:00.000Z'), acknowledgment, 300_000)).toBe(false)
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T10:05:00.001Z'), acknowledgment, 300_000)).toBe(true)
  })

  it('never substitutes generated/download time for source query start', () => {
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T09:59:59.000Z'), acknowledgment, 0)).toBe(false)
  })

  it('retries only bounded PostgreSQL transaction failures', () => {
    expect(isRetryableStockTransactionError({ code: 'P2034' })).toBe(true)
    expect(isRetryableStockTransactionError({ code: 'P2028' })).toBe(true)
    expect(isRetryableStockTransactionError(new Error('SQLSTATE 40001 serialization failure'))).toBe(true)
    expect(isRetryableStockTransactionError(new Error('SQLSTATE 40P01 deadlock detected'))).toBe(true)
    expect(isRetryableStockTransactionError(new Error('constraint violation'))).toBe(false)
  })
})
