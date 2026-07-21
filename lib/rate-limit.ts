import { prisma } from '@/lib/prisma'

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

export type RateLimitOptions = {
  windowMs?: number
  maxAttempts?: number
}

export type RateLimitResult = { limited: boolean; remaining: number; resetAt: number }

/**
 * DB-backed sliding-window rate limit. Persisted in Postgres so it works across serverless
 * lambda instances (an in-memory Map is per-instance and effectively useless on Vercel).
 * Fails open: if the limiter DB is unavailable, requests are allowed rather than blocked.
 */
export async function checkRateLimit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = options.windowMs ?? WINDOW_MS
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const resetAt = new Date(now + windowMs)
  try {
    // Atomic: start a fresh window if the previous one expired, otherwise increment.
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < now() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `
    const row = rows[0]
    const count = Number(row?.count ?? 1)
    const windowEnd = row?.resetAt ? new Date(row.resetAt).getTime() : now + WINDOW_MS
    if (count > maxAttempts) {
      return { limited: true, remaining: 0, resetAt: windowEnd }
    }
    return { limited: false, remaining: Math.max(0, maxAttempts - count), resetAt: windowEnd }
  } catch (e) {
    console.error('[rate-limit]', e)
    return { limited: false, remaining: maxAttempts, resetAt: now + windowMs }
  }
}

/** Clear a key's counter (e.g. after a successful login). */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } })
  } catch {
    /* best effort */
  }
}

/** Remove expired counters. Call occasionally (amortised) to keep the table small. */
export async function gcRateLimitStore(): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } })
  } catch {
    /* best effort */
  }
}
