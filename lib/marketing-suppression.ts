import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { logOperationalEvent } from '@/lib/observability'

/**
 * Marketing suppression list: the single source of truth for "do not send this person
 * mailings or invitations".
 *
 * One KeyValueSetting row per normalized email (`marketing:optout:<email>`). Keying by
 * email instead of by User row means the block survives a re-import of the client, a
 * deleted-and-recreated account and several accounts sharing one address. Nothing in the
 * ERP/GrinS sync or the client import touches these rows (see the guard test).
 *
 * Writers: the admin toggle (source `admin`), the signed unsubscribe link of broadcasts
 * (source `self_service`, the hook for a future link in other mailings) and GDPR erasure
 * (source `erasure`). Rows written before this module only have `{ email, optedOutAt }`
 * and are read as `self_service`.
 *
 * Every marketing email must go through {@link sendMarketingEmail}: it re-reads the list
 * immediately before SMTP, so a block set after a batch was selected, queued, retried or
 * resumed still stops the email. Transactional and service email (orders, payments,
 * delivery, password reset, email change, security notices) keeps using sendEmail.
 */

export const MARKETING_SUPPRESSION_PREFIX = 'marketing:optout:'
export const SUPPRESSION_REASON_MAX_LENGTH = 500
export const CONSENT_NOTE_MAX_LENGTH = 500

export type MarketingSuppressionSource = 'admin' | 'self_service' | 'erasure'

export type MarketingSuppression = {
  email: string
  optedOutAt: string
  source: MarketingSuppressionSource
  setByUserId: string | null
  setByName: string | null
  reason: string | null
}

type Db = Pick<ExtendedTransactionClient, 'keyValueSetting'>

export function normalizeMarketingEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function marketingSuppressionKey(email: string): string {
  return `${MARKETING_SUPPRESSION_PREFIX}${normalizeMarketingEmail(email)}`
}

const SOURCES: readonly MarketingSuppressionSource[] = ['admin', 'self_service', 'erasure']

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Tolerant read: any stored row means "suppressed", even a malformed one (fail-safe direction). */
export function parseMarketingSuppression(key: string, value: unknown): MarketingSuppression {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const source = SOURCES.includes(v.source as MarketingSuppressionSource) ? v.source as MarketingSuppressionSource : 'self_service'
  return {
    email: key.slice(MARKETING_SUPPRESSION_PREFIX.length),
    optedOutAt: str(v.optedOutAt) ?? new Date(0).toISOString(),
    source,
    setByUserId: str(v.setByUserId),
    setByName: str(v.setByName),
    reason: str(v.reason),
  }
}

/** Suppression rows for the given emails, keyed by normalized email. One query. */
export async function getMarketingSuppressions(emails: string[], db: Db = prisma): Promise<Map<string, MarketingSuppression>> {
  const keys = [...new Set(emails.filter(Boolean).map(marketingSuppressionKey))]
  if (keys.length === 0) return new Map()
  const rows = await db.keyValueSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } })
  return new Map(rows.map((row) => {
    const entry = parseMarketingSuppression(row.key, row.value)
    return [entry.email, entry]
  }))
}

export async function isMarketingSuppressed(email: string, db: Db = prisma): Promise<boolean> {
  const row = await db.keyValueSetting.findUnique({ where: { key: marketingSuppressionKey(email) }, select: { key: true } })
  return row !== null
}

/**
 * Ids of users whose (normalized) email is on the list. Used for list filters and to
 * leave suppressed users out of bulk selections in SQL, independent of email casing.
 */
export async function suppressedUserIds(db: Pick<ExtendedTransactionClient, '$queryRaw'> = prisma, candidateIds?: string[]): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return []
  const rows = candidateIds
    ? await db.$queryRaw<Array<{ id: string }>>`
        SELECT u.id FROM "User" u
        JOIN "KeyValueSetting" k ON k.key = ${MARKETING_SUPPRESSION_PREFIX} || lower(btrim(u.email))
        WHERE u.id IN (${Prisma.join(candidateIds)})`
    : await db.$queryRaw<Array<{ id: string }>>`
        SELECT u.id FROM "User" u
        JOIN "KeyValueSetting" k ON k.key = ${MARKETING_SUPPRESSION_PREFIX} || lower(btrim(u.email))`
  return rows.map((row) => row.id)
}

/**
 * Adds an email to the list. An existing row is kept as it is (the first, documented
 * reason wins and an admin entry is never downgraded by a later self-service click).
 * Returns whether a new row was created.
 */
export async function addMarketingSuppression(
  db: Db,
  input: { email: string; source: MarketingSuppressionSource; setByUserId?: string | null; setByName?: string | null; reason?: string | null },
): Promise<{ created: boolean }> {
  const key = marketingSuppressionKey(input.email)
  const existing = await db.keyValueSetting.findUnique({ where: { key }, select: { key: true } })
  if (existing) return { created: false }
  const value = {
    email: normalizeMarketingEmail(input.email),
    optedOutAt: new Date().toISOString(),
    source: input.source,
    setByUserId: input.setByUserId ?? null,
    setByName: input.setByName ?? null,
    reason: input.reason?.trim() ? input.reason.trim().slice(0, SUPPRESSION_REASON_MAX_LENGTH) : null,
  }
  // upsert: a concurrent writer that won the race leaves its row in place.
  await db.keyValueSetting.upsert({
    where: { key },
    create: { key, value: value as unknown as Prisma.InputJsonValue },
    update: {},
  })
  return { created: true }
}

/** Removes an email from the list; returns the removed entry, or null if there was none. */
export async function removeMarketingSuppression(db: Db, email: string): Promise<MarketingSuppression | null> {
  const key = marketingSuppressionKey(email)
  const row = await db.keyValueSetting.findUnique({ where: { key }, select: { key: true, value: true } })
  if (!row) return null
  const { count } = await db.keyValueSetting.deleteMany({ where: { key } })
  return count === 1 ? parseMarketingSuppression(row.key, row.value) : null
}

/** A changed address keeps the person's block: the new address inherits the old entry. */
export async function carryMarketingSuppression(db: Db, oldEmail: string, newEmail: string): Promise<boolean> {
  if (normalizeMarketingEmail(oldEmail) === normalizeMarketingEmail(newEmail)) return false
  const previous = await getMarketingSuppressions([oldEmail], db)
  const entry = previous.get(normalizeMarketingEmail(oldEmail))
  if (!entry) return false
  const { created } = await addMarketingSuppression(db, {
    email: newEmail,
    source: entry.source,
    setByUserId: entry.setByUserId,
    setByName: entry.setByName,
    reason: entry.reason,
  })
  return created
}

export type MarketingCategory =
  | 'invitation'
  | 'card_rules_campaign'
  | 'broadcast'
  | 'admin_notification'
  | 'product_news'

/**
 * The only way to send marketing email. Checks the list right before SMTP (not only when
 * the batch was planned). A failed lookup throws, so the email is not sent (fail-closed).
 */
export async function sendMarketingEmail(
  to: string,
  subject: string,
  html: string,
  meta: { category: MarketingCategory; userId?: string },
  options?: Parameters<typeof sendEmail>[3],
): Promise<'sent' | 'suppressed'> {
  // One recipient per marketing email: a list would slip extra addresses past the check.
  if (!to || /[,;]/u.test(to)) throw new Error('marketing_email_single_recipient_required')
  if (await isMarketingSuppressed(to)) {
    logOperationalEvent({ event: 'marketing_email_suppressed', level: 'info', category: meta.category, userId: meta.userId })
    return 'suppressed'
  }
  await sendEmail(to, subject, html, options)
  return 'sent'
}
