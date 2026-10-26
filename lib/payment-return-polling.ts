export const PAYMENT_CONFIRMATION_POLL_ATTEMPTS = 20
export const PAYMENT_CONFIRMATION_POLL_INTERVAL_MS = 2_000

export type PaymentConfirmationResult = 'paid' | 'timeout' | 'aborted'
export type PaymentReturnState = 'none' | 'processing' | 'paid' | 'timeout'

export function blocksPayseraRetry(state: PaymentReturnState): boolean {
  return state !== 'none'
}

type PollOptions<T extends { paymentStatus?: string }> = {
  attempts?: number
  intervalMs?: number
  signal?: AbortSignal
  wait?: (delayMs: number) => Promise<void>
  onOrder?: (order: T) => void
}

const delay = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs))

/** Limited polling for the normal redirect-before-webhook window. */
export async function pollForPaymentConfirmation<T extends { paymentStatus?: string }>(
  loadOrder: () => Promise<T | null>,
  options: PollOptions<T> = {},
): Promise<PaymentConfirmationResult> {
  const attempts = options.attempts ?? PAYMENT_CONFIRMATION_POLL_ATTEMPTS
  const intervalMs = options.intervalMs ?? PAYMENT_CONFIRMATION_POLL_INTERVAL_MS
  const wait = options.wait ?? delay

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) return 'aborted'
    try {
      const order = await loadOrder()
      if (order) {
        options.onOrder?.(order)
        if (order.paymentStatus === 'paid') return 'paid'
      }
    } catch {
      // A transient read failure must not be presented as a failed payment.
    }
    if (attempt + 1 < attempts) await wait(intervalMs)
  }
  return options.signal?.aborted ? 'aborted' : 'timeout'
}

export function payRetryResult(responseOk: boolean, responseStatus: number, payload: {
  status?: string
  error?: string
  paymentUrl?: string
} | null): 'paid' | 'redirect' | 'refresh-paid' | 'error' {
  if (responseOk && payload?.status === 'paid') return 'paid'
  if (responseOk && payload?.paymentUrl) return 'redirect'
  if (responseStatus === 409 && payload?.error === 'already_paid') return 'refresh-paid'
  return 'error'
}
