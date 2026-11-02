import { describe, expect, it } from 'vitest'
import { ORDER_CUSTOMER_COMMENT_MAX_LENGTH, parseOrderCustomerComment } from './order-customer-comment'

describe('parseOrderCustomerComment', () => {
  it.each([undefined, null, '', '   \n  '])('normalizes an empty value to no comment', (value) => {
    expect(parseOrderCustomerComment(value)).toEqual({ ok: true })
  })

  it('trims the value while preserving its text and line breaks', () => {
    expect(parseOrderCustomerComment('  Leave at reception.\nCall first.  ')).toEqual({
      ok: true,
      value: 'Leave at reception.\nCall first.',
    })
  })

  it('rejects non-text values and values over the limit', () => {
    expect(parseOrderCustomerComment({ text: 'no' })).toEqual({ ok: false, error: 'invalid_customer_comment' })
    expect(parseOrderCustomerComment('x'.repeat(ORDER_CUSTOMER_COMMENT_MAX_LENGTH + 1)))
      .toEqual({ ok: false, error: 'customer_comment_too_long' })
  })
})
