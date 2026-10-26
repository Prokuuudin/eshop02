import { describe, expect, it, vi } from 'vitest'
import { blocksPayseraRetry, payRetryResult, pollForPaymentConfirmation } from './payment-return-polling'

describe('Paysera success-return polling', () => {
  it('keeps polling when the success redirect arrives before the delayed webhook', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ paymentStatus: 'unpaid' })
      .mockResolvedValueOnce({ paymentStatus: 'unpaid' })
      .mockResolvedValueOnce({ paymentStatus: 'paid' })
    const seen: string[] = []

    const result = await pollForPaymentConfirmation(load, {
      attempts: 5,
      wait: async () => undefined,
      onOrder: (order) => seen.push(order.paymentStatus ?? ''),
    })

    expect(result).toBe('paid')
    expect(load).toHaveBeenCalledTimes(3)
    expect(seen).toEqual(['unpaid', 'unpaid', 'paid'])
  })

  it('times out neutrally after a bounded number of reads when the webhook stays delayed', async () => {
    const load = vi.fn().mockResolvedValue({ paymentStatus: 'unpaid' })

    const result = await pollForPaymentConfirmation(load, {
      attempts: 3,
      wait: async () => undefined,
    })

    expect(result).toBe('timeout')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('treats paid and legacy already_paid responses as refreshes, not generic failures', () => {
    expect(payRetryResult(true, 200, { status: 'paid' })).toBe('paid')
    expect(payRetryResult(false, 409, { error: 'already_paid' })).toBe('refresh-paid')
    expect(payRetryResult(false, 502, { error: 'payment_gateway_error' })).toBe('error')
  })

  it('blocks repeat payment throughout success-return processing and its neutral timeout', () => {
    expect(blocksPayseraRetry('processing')).toBe(true)
    expect(blocksPayseraRetry('paid')).toBe(true)
    expect(blocksPayseraRetry('timeout')).toBe(true)
    expect(blocksPayseraRetry('none')).toBe(false)
  })
})
