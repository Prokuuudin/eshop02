export const ORDER_CUSTOMER_COMMENT_MAX_LENGTH = 2000

export type OrderCustomerCommentResult =
  | { ok: true; value?: string }
  | { ok: false; error: 'invalid_customer_comment' | 'customer_comment_too_long' }

/** Normalize the customer-visible order comment. Internal admin notes use OrderNote instead. */
export function parseOrderCustomerComment(value: unknown): OrderCustomerCommentResult {
  if (value === undefined || value === null) return { ok: true }
  if (typeof value !== 'string') return { ok: false, error: 'invalid_customer_comment' }
  if (value.length > ORDER_CUSTOMER_COMMENT_MAX_LENGTH) {
    return { ok: false, error: 'customer_comment_too_long' }
  }

  const normalized = value.trim()
  return normalized ? { ok: true, value: normalized } : { ok: true }
}
