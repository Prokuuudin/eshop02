import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import {
  addMarketingSuppression,
  getMarketingSuppressions,
  isMarketingSuppressed,
  normalizeMarketingEmail,
  type MarketingSuppressionSource,
} from '@/lib/marketing-suppression'

const keyFor = (email: string) => `newsletter:subscriber:${email.toLowerCase()}`
const developmentUnsubSecret = crypto.randomBytes(32).toString('hex')

export async function subscribeToNewsletter(email: string): Promise<void> {
  const value = { email: email.toLowerCase(), consentAt: new Date().toISOString() }
  await prisma.keyValueSetting.upsert({
    where: { key: keyFor(email) },
    create: { key: keyFor(email), value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  })
}

/**
 * Records a marketing opt-out (GDPR Art. 7(3) / ePrivacy — withdrawal must be as
 * easy as consent). Removes any active newsletter subscription and adds the email
 * to the central suppression list (lib/marketing-suppression.ts) that every
 * marketing email and invitation honours. An existing entry (e.g. set by an
 * administrator with a reason) is kept unchanged.
 */
export async function unsubscribeFromMarketing(
  email: string,
  source: Extract<MarketingSuppressionSource, 'self_service' | 'erasure'> = 'self_service',
): Promise<void> {
  const lower = normalizeMarketingEmail(email)
  await prisma.keyValueSetting.deleteMany({ where: { key: keyFor(lower) } })
  await addMarketingSuppression(prisma, { email: lower, source })
}

export async function isMarketingOptedOut(email: string): Promise<boolean> {
  return isMarketingSuppressed(email)
}

/** Batched form of {@link isMarketingOptedOut} — one query for many emails instead of one per email. */
export async function getMarketingOptedOutSet(emails: string[]): Promise<Set<string>> {
  return new Set((await getMarketingSuppressions(emails)).keys())
}

// Forging this token only lets an attacker unsubscribe someone else (a fail-safe
// direction — they stop receiving marketing), so a server-side HMAC over the email
// is sufficient and needs no per-email storage. Production deliberately fails
// closed unless an independent NEWSLETTER_UNSUB_SECRET is provisioned.
function unsubSecret(): string {
  const secret = process.env.NEWSLETTER_UNSUB_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEWSLETTER_UNSUB_SECRET is required in production')
  }
  // Local/test convenience without a public deterministic fallback. Links made
  // with this ephemeral value intentionally stop working after a process restart.
  return developmentUnsubSecret
}

/** False only in production without NEWSLETTER_UNSUB_SECRET: unsubscribe links can be neither made nor checked. */
export function marketingUnsubAvailable(): boolean {
  try {
    unsubSecret()
    return true
  } catch {
    return false
  }
}

export function marketingUnsubToken(email: string): string {
  return crypto.createHmac('sha256', unsubSecret()).update(email.toLowerCase()).digest('hex').slice(0, 32)
}

export function verifyMarketingUnsubToken(email: string, token: string): boolean {
  const expected = Buffer.from(marketingUnsubToken(email))
  const got = Buffer.from(token)
  return expected.length === got.length && crypto.timingSafeEqual(expected, got)
}

export function marketingUnsubUrl(email: string, baseUrl: string): string {
  const lower = email.toLowerCase()
  return `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(lower)}&token=${marketingUnsubToken(lower)}`
}
