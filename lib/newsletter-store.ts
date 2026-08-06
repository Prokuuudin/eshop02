import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

const keyFor = (email: string) => `newsletter:subscriber:${email.toLowerCase()}`
const optOutKeyFor = (email: string) => `marketing:optout:${email.toLowerCase()}`
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
 * to the suppression list that outbound marketing (broadcast) must honour.
 */
export async function unsubscribeFromMarketing(email: string): Promise<void> {
  const lower = email.toLowerCase()
  await prisma.keyValueSetting.deleteMany({ where: { key: keyFor(lower) } })
  const value = { email: lower, optedOutAt: new Date().toISOString() }
  await prisma.keyValueSetting.upsert({
    where: { key: optOutKeyFor(lower) },
    create: { key: optOutKeyFor(lower), value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  })
}

export async function isMarketingOptedOut(email: string): Promise<boolean> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: optOutKeyFor(email) } })
  return row !== null
}

/** Batched form of {@link isMarketingOptedOut} — one query for many emails instead of one per email. */
export async function getMarketingOptedOutSet(emails: string[]): Promise<Set<string>> {
  const lowered = emails.map((e) => e.toLowerCase())
  const rows = await prisma.keyValueSetting.findMany({
    where: { key: { in: lowered.map(optOutKeyFor) } },
    select: { key: true },
  })
  const prefix = 'marketing:optout:'
  return new Set(rows.map((r) => r.key.slice(prefix.length)))
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
