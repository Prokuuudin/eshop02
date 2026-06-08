const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

type Entry = { count: number; resetAt: number }
const store = new Map<string, Entry>()

export function checkRateLimit(key: string): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { limited: false, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS }
  }

  entry.count++

  if (entry.count > MAX_ATTEMPTS) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt }
  }

  return { limited: false, remaining: MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}

// Periodic GC — call occasionally to prevent unbounded growth
export function gcRateLimitStore(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}
