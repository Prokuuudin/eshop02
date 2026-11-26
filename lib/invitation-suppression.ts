import 'server-only'
import crypto from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import type { InviteLang } from '@/lib/invitations'

/**
 * Invitation-only suppression is deliberately separate from the email-based marketing
 * suppression list. It belongs to the client account, so changing the email address or
 * replacing an activation token cannot silently restore repeat invitations.
 */
export const INVITATION_SUPPRESSION_PREFIX = 'invitation:optout:user:'
export const INVITATION_SUPPRESSION_REASON_MAX_LENGTH = 500

export type InvitationSuppressionSource = 'client_link' | 'admin'

export type InvitationSuppression = {
  userId: string
  optedOutAt: string
  source: InvitationSuppressionSource
  setByUserId: string | null
  setByName: string | null
  reason: string | null
}

type Db = Pick<ExtendedTransactionClient, 'keyValueSetting'>

export function invitationSuppressionKey(userId: string): string {
  return `${INVITATION_SUPPRESSION_PREFIX}${userId}`
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Any row is treated as a block, even if an old/malformed value is encountered. */
export function parseInvitationSuppression(key: string, value: unknown): InvitationSuppression {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    userId: key.slice(INVITATION_SUPPRESSION_PREFIX.length),
    optedOutAt: nonEmptyString(stored.optedOutAt) ?? new Date(0).toISOString(),
    source: stored.source === 'admin' ? 'admin' : 'client_link',
    setByUserId: nonEmptyString(stored.setByUserId),
    setByName: nonEmptyString(stored.setByName),
    reason: nonEmptyString(stored.reason),
  }
}

export async function getInvitationSuppressions(userIds: string[], db: Db = prisma): Promise<Map<string, InvitationSuppression>> {
  const keys = [...new Set(userIds.filter(Boolean).map(invitationSuppressionKey))]
  if (keys.length === 0) return new Map()
  const rows = await db.keyValueSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } })
  return new Map(rows.map((row) => {
    const entry = parseInvitationSuppression(row.key, row.value)
    return [entry.userId, entry]
  }))
}

export async function isInvitationSuppressed(userId: string, db: Db = prisma): Promise<boolean> {
  if (!userId) return false
  return await db.keyValueSetting.findUnique({ where: { key: invitationSuppressionKey(userId) }, select: { key: true } }) !== null
}

export async function invitationSuppressedUserIds(
  db: Db = prisma,
  candidateIds?: string[],
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return []
  const rows = candidateIds
    ? await db.keyValueSetting.findMany({
        where: { key: { in: [...new Set(candidateIds.map(invitationSuppressionKey))] } },
        select: { key: true },
      })
    : await db.keyValueSetting.findMany({
        where: { key: { startsWith: INVITATION_SUPPRESSION_PREFIX } },
        select: { key: true },
      })
  return rows.map((row) => row.key.slice(INVITATION_SUPPRESSION_PREFIX.length)).filter(Boolean)
}

/** First writer wins, making repeated client confirmations and concurrent requests idempotent. */
export async function addInvitationSuppression(
  db: Db,
  input: {
    userId: string
    source: InvitationSuppressionSource
    setByUserId?: string | null
    setByName?: string | null
    reason?: string | null
  },
): Promise<{ created: boolean }> {
  const key = invitationSuppressionKey(input.userId)
  if (await db.keyValueSetting.findUnique({ where: { key }, select: { key: true } })) return { created: false }
  const value = {
    userId: input.userId,
    optedOutAt: new Date().toISOString(),
    source: input.source,
    setByUserId: input.setByUserId ?? null,
    setByName: input.setByName ?? null,
    reason: input.reason?.trim()
      ? input.reason.trim().slice(0, INVITATION_SUPPRESSION_REASON_MAX_LENGTH)
      : null,
  }
  await db.keyValueSetting.upsert({
    where: { key },
    create: { key, value: value as unknown as Prisma.InputJsonValue },
    update: {},
  })
  return { created: true }
}

export async function removeInvitationSuppression(db: Db, userId: string): Promise<InvitationSuppression | null> {
  const key = invitationSuppressionKey(userId)
  const row = await db.keyValueSetting.findUnique({ where: { key }, select: { key: true, value: true } })
  if (!row) return null
  const { count } = await db.keyValueSetting.deleteMany({ where: { key } })
  return count === 1 ? parseInvitationSuppression(row.key, row.value) : null
}

// Domain-separate this signature from newsletter unsubscribe tokens. Production already
// provisions NEWSLETTER_UNSUB_SECRET for PR #70, so this adds no second deployment secret.
const developmentSecret = crypto.randomBytes(32).toString('hex')

function signatureSecret(): string {
  const secret = process.env.NEWSLETTER_UNSUB_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEWSLETTER_UNSUB_SECRET is required in production')
  }
  return developmentSecret
}

export function invitationOptOutToken(userId: string): string {
  return crypto
    .createHmac('sha256', signatureSecret())
    .update(`invitation-opt-out:v1:${userId}`)
    .digest('hex')
}

export function verifyInvitationOptOutToken(userId: string, token: string): boolean {
  if (!userId || !/^[a-f0-9]{64}$/u.test(token)) return false
  const expected = Buffer.from(invitationOptOutToken(userId), 'utf8')
  const supplied = Buffer.from(token, 'utf8')
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)
}

export function invitationOptOutUrl(userId: string, language: InviteLang, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${base}/${language}/invitation-opt-out?userId=${encodeURIComponent(userId)}&token=${invitationOptOutToken(userId)}`
}
