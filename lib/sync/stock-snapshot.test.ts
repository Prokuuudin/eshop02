import { describe, expect, it } from 'vitest'
import { snapshotIsAfterAcknowledgment } from './stock-snapshot'

describe('stock snapshot causality', () => {
  const acknowledgment = new Date('2026-10-12T10:00:00.000Z')

  it('requires runStartedAt to be strictly after acknowledgment plus skew', () => {
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T10:05:00.000Z'), acknowledgment, 300_000)).toBe(false)
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T10:05:00.001Z'), acknowledgment, 300_000)).toBe(true)
  })

  it('never substitutes generated/download time for source query start', () => {
    expect(snapshotIsAfterAcknowledgment(new Date('2026-10-12T09:59:59.000Z'), acknowledgment, 0)).toBe(false)
  })
})
