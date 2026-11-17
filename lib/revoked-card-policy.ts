import 'server-only'

import { createHash } from 'node:crypto'
import { z } from 'zod'

import { normalizeCardNumber } from '@/lib/card-number'
import { prisma, type ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export const REVOKED_CARD_SETTING_KEY = 'revoked-client-cards:v1'
export const REVOKED_CARD_BATCH_SIZE = 905
/**
 * Cards revoked one by one from the admin panel live in their own row, never in the
 * 2026-11-16 batch row above: older releases accept that row only as exactly the 905-card
 * batch, so writing to it would fail every card path closed after a rollback.
 */
export const ADMIN_REVOKED_CARD_SETTING_KEY = 'revoked-client-cards:admin:v1'
export const REVOKE_REASON_MAX_LENGTH = 500

const FORBIDDEN_CARDS = new Set(['111', '5044'])
const PRESERVED_LOGIN_CARD = '5555'

const entrySchema = z.object({
  userId: z.string().trim().min(1).max(200),
  preserveLogin: z.boolean(),
}).strict()

const activeConfigSchema = z.object({
  active: z.literal(true),
  source: z.string().trim().min(1).max(1000),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
  cards: z.record(z.string(), entrySchema),
}).strict()

export type RevokedCardEntry = z.infer<typeof entrySchema>
export type RevokedCardConfig = z.infer<typeof activeConfigSchema>

export type RevokedCardPolicy = {
  active: boolean
  source: string | null
  checksum: string | null
  cards: ReadonlyMap<string, RevokedCardEntry>
  cardNumbers: readonly string[]
}

type PolicyDb = Pick<ExtendedPrismaClient, 'keyValueSetting'>

export class RevokedCardPolicyError extends Error {
  constructor(
    public readonly code:
      | 'configuration_unavailable'
      | 'invalid_configuration'
      | 'card_revoked'
      | 'card_protected'
      | 'not_restorable',
    message: string,
  ) {
    super(message)
    this.name = 'RevokedCardPolicyError'
  }
}

const INACTIVE_POLICY: RevokedCardPolicy = Object.freeze({
  active: false,
  source: null,
  checksum: null,
  cards: new Map(),
  cardNumbers: Object.freeze([]),
})

let cache: { updatedAt: number; policy: RevokedCardPolicy } | null = null

function canonicalEntries(cards: Record<string, RevokedCardEntry>): Array<{
  cardNumber: string
  userId: string
  preserveLogin: boolean
}> {
  return Object.entries(cards)
    .map(([cardNumber, entry]) => ({ cardNumber, userId: entry.userId, preserveLogin: entry.preserveLogin }))
    .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber, 'en'))
}

/** SHA-256 of the canonical, sorted card-to-user mapping. Source and active state are metadata. */
export function computeRevokedCardChecksum(cards: Record<string, RevokedCardEntry>): string {
  return createHash('sha256').update(JSON.stringify(canonicalEntries(cards)), 'utf8').digest('hex')
}

function invalid(message: string): never {
  throw new RevokedCardPolicyError('invalid_configuration', message)
}

/**
 * Structural validation only. Per-account state (ownership, role, company, activation) is checked
 * by verifyRevokedCardPolicyAgainstDatabase before activation, not on every request: a later edit
 * of one mapped account must not turn the whole registry invalid and fail every card login closed.
 */
function validateActiveConfig(config: RevokedCardConfig): RevokedCardPolicy {
  const rawEntries = Object.entries(config.cards)
  if (rawEntries.length !== REVOKED_CARD_BATCH_SIZE) {
    invalid(`Expected ${REVOKED_CARD_BATCH_SIZE} revoked cards, received ${rawEntries.length}`)
  }

  const normalizedCards: Record<string, RevokedCardEntry> = {}
  const userIds = new Set<string>()
  for (const [rawCardNumber, entry] of rawEntries) {
    const cardNumber = normalizeCardNumber(rawCardNumber)
    if (!cardNumber || cardNumber !== rawCardNumber) invalid(`Card number is not canonical: ${rawCardNumber}`)
    if (FORBIDDEN_CARDS.has(cardNumber)) invalid(`Protected card is present: ${cardNumber}`)
    if (normalizedCards[cardNumber]) invalid(`Duplicate normalized card: ${cardNumber}`)
    if (userIds.has(entry.userId)) invalid(`User is mapped to more than one card: ${entry.userId}`)
    normalizedCards[cardNumber] = entry
    userIds.add(entry.userId)
  }

  if (computeRevokedCardChecksum(normalizedCards) !== config.checksum) invalid('Checksum mismatch')

  const preserved = Object.entries(normalizedCards).filter(([, entry]) => entry.preserveLogin)
  if (preserved.length !== 1 || preserved[0][0] !== PRESERVED_LOGIN_CARD) {
    invalid(`preserveLogin must be enabled only for card ${PRESERVED_LOGIN_CARD}`)
  }

  const cardNumbers = Object.freeze(Object.keys(normalizedCards).sort((a, b) => a.localeCompare(b, 'en')))
  return Object.freeze({
    active: true,
    source: config.source,
    checksum: config.checksum,
    cards: new Map(Object.entries(normalizedCards)),
    cardNumbers,
  })
}

/**
 * Pre-activation check (read-only): every mapped user still holds its card, is a plain customer
 * without a company, no company holds a revoked number, and the preserved-login owner is an
 * activated individual account. Run it against the exact config before writing active=true.
 */
export async function verifyRevokedCardPolicyAgainstDatabase(
  value: unknown,
  db: Pick<ExtendedPrismaClient, 'user' | 'company'> = prisma,
): Promise<RevokedCardPolicy> {
  const parsed = activeConfigSchema.safeParse(value)
  if (!parsed.success) invalid('Active setting has an invalid shape')
  const policy = validateActiveConfig(parsed.data)
  const normalizedCards = Object.fromEntries(policy.cards)
  const userIds = [...policy.cards.values()].map((entry) => entry.userId)

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      cardNumber: true,
      platformRole: true,
      superAdmin: true,
      teamRole: true,
      companyId: true,
      customerType: true,
      mustChangePassword: true,
      privacyAcknowledgedAt: true,
    },
  })
  if (users.length !== userIds.length) invalid('One or more mapped users are missing or duplicated')

  const companyCards = await db.company.findMany({
    where: { cardNumber: { in: Object.keys(normalizedCards) } },
    select: { cardNumber: true },
  })
  if (companyCards.length > 0) invalid('A revoked number is still attached to a B2B company')

  const usersById = new Map(users.map((user) => [user.id, user]))
  for (const [cardNumber, entry] of Object.entries(normalizedCards)) {
    const user = usersById.get(entry.userId)
    if (!user || normalizeCardNumber(user.cardNumber ?? '') !== cardNumber) {
      invalid(`Card-to-user ownership mismatch for card ${cardNumber}`)
    }
    if (user.platformRole !== 'customer' || user.superAdmin || user.teamRole !== null || user.companyId !== null) {
      invalid(`Privileged or B2B account cannot be included: ${entry.userId}`)
    }
    if (entry.preserveLogin && (
      user.customerType !== 'individual'
      || user.mustChangePassword
      || user.privacyAcknowledgedAt === null
    )) {
      invalid(`Preserved login is not an activated individual account: ${entry.userId}`)
    }
  }
  return policy
}

/**
 * Missing setting means the feature has not been activated. Once a row exists, malformed or
 * unreadable state never falls back to "no revocations": callers fail closed with a 5xx response.
 */
export async function getRevokedCardPolicy(db: PolicyDb = prisma): Promise<RevokedCardPolicy> {
  let row: { value: unknown; updatedAt: Date } | null
  try {
    row = await db.keyValueSetting.findUnique({
      where: { key: REVOKED_CARD_SETTING_KEY },
      select: { value: true, updatedAt: true },
    })
  } catch {
    throw new RevokedCardPolicyError('configuration_unavailable', 'Unable to read revoked-card policy')
  }
  if (!row) return INACTIVE_POLICY

  if (db === prisma && cache?.updatedAt === row.updatedAt.getTime()) return cache.policy
  if (!row.value || typeof row.value !== 'object' || Array.isArray(row.value)) invalid('Setting value must be an object')

  const state = row.value as Record<string, unknown>
  if (state.active === false) {
    if (db === prisma) cache = { updatedAt: row.updatedAt.getTime(), policy: INACTIVE_POLICY }
    return INACTIVE_POLICY
  }
  const parsed = activeConfigSchema.safeParse(state)
  if (!parsed.success) invalid('Active setting has an invalid shape')

  const policy = validateActiveConfig(parsed.data)
  if (db === prisma) cache = { updatedAt: row.updatedAt.getTime(), policy }
  return policy
}

export function activeCardNumberFilter(policy: RevokedCardPolicy): {
  not: null
  notIn?: string[]
} {
  return policy.cardNumbers.length > 0
    ? { not: null, notIn: [...policy.cardNumbers] }
    : { not: null }
}

export async function assertCardAssignable(cardNumber: string, db: PolicyDb = prisma): Promise<void> {
  await assertCardsAssignable([cardNumber], db)
}

export async function assertCardsAssignable(cardNumbers: readonly string[], db: PolicyDb = prisma): Promise<void> {
  const policy = await getRevokedCardPolicy(db)
  if (cardNumbers.some((cardNumber) => policy.cards.has(normalizeCardNumber(cardNumber)))) {
    throw new RevokedCardPolicyError('card_revoked', 'Revoked card cannot be assigned')
  }
  const adminRevoked = await getAdminCardRevocations(db)
  if (cardNumbers.some((cardNumber) => adminRevoked.has(normalizeCardNumber(cardNumber)))) {
    throw new RevokedCardPolicyError('card_revoked', 'Revoked card cannot be assigned')
  }
}

export async function isCardRevoked(cardNumber: string, db: PolicyDb = prisma): Promise<boolean> {
  const policy = await getRevokedCardPolicy(db)
  const normalized = normalizeCardNumber(cardNumber)
  return policy.cards.has(normalized) || (await getAdminCardRevocations(db)).has(normalized)
}

/** Revoked ownership is immutable until the policy itself is rolled back. */
export async function assertUserCardMutationAllowed(
  userId: string,
  currentCardNumber: string | null,
  nextCardNumber: string | null,
  db: PolicyDb = prisma,
): Promise<void> {
  const policy = await getRevokedCardPolicy(db)
  const current = normalizeCardNumber(currentCardNumber ?? '')
  const next = normalizeCardNumber(nextCardNumber ?? '')
  const currentEntry = policy.cards.get(current)
  if (currentEntry?.userId === userId && current !== next) {
    throw new RevokedCardPolicyError('card_revoked', 'Revoked card ownership cannot be changed')
  }
  if (next && next !== current && (policy.cards.has(next) || (await getAdminCardRevocations(db)).has(next))) {
    throw new RevokedCardPolicyError('card_revoked', 'Revoked card cannot be assigned')
  }
}

type LoginSubject = {
  id: string
  platformRole: string
  superAdmin: boolean
  teamRole: string | null
  companyId: string | null
  customerType: string | null
  mustChangePassword: boolean
  privacyAcknowledgedAt: Date | null
}

/** A revoked number remains a credential only for the explicitly mapped, non-B2B owner of 5555. */
export async function canAuthenticateWithCard(
  cardNumber: string,
  user: LoginSubject | null,
  db: PolicyDb = prisma,
): Promise<boolean> {
  const normalized = normalizeCardNumber(cardNumber)
  const policy = await getRevokedCardPolicy(db)
  const entry = policy.cards.get(normalized)
  if (!entry) return true
  return Boolean(user
    && normalized === PRESERVED_LOGIN_CARD
    && entry.preserveLogin
    && entry.userId === user.id
    && user.platformRole === 'customer'
    && !user.superAdmin
    && user.teamRole === null
    && user.companyId === null
    && user.customerType === 'individual'
    && !user.mustChangePassword
    && user.privacyAcknowledgedAt !== null)
}

// -- Admin-panel revocations -------------------------------------------------------------------
//
// Revoking detaches the number from the customer (User.cardNumber := null) and records it here.
// Card login, card activation and invitations all find the customer through User.cardNumber, so
// the number stops working in this and in older releases alike; this row only keeps the number
// from being issued again. The account, orders and bonus points are untouched.

const adminEntrySchema = z.object({
  userId: z.string().trim().min(1).max(200),
  revokedAt: z.iso.datetime(),
  revokedBy: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(REVOKE_REASON_MAX_LENGTH),
}).strict()

const adminRegistrySchema = z.object({ cards: z.record(z.string(), adminEntrySchema) }).strict()

export type AdminCardRevocation = z.infer<typeof adminEntrySchema>

function parseAdminRegistry(value: unknown): Map<string, AdminCardRevocation> {
  const parsed = adminRegistrySchema.safeParse(value)
  if (!parsed.success) invalid('Admin revocation setting has an invalid shape')
  const cards = new Map<string, AdminCardRevocation>()
  for (const [cardNumber, entry] of Object.entries(parsed.data.cards)) {
    if (!cardNumber || normalizeCardNumber(cardNumber) !== cardNumber) invalid(`Card number is not canonical: ${cardNumber}`)
    cards.set(cardNumber, entry)
  }
  return cards
}

/** No row means nothing was revoked from the admin panel. Unreadable or malformed fails closed. */
export async function getAdminCardRevocations(db: PolicyDb = prisma): Promise<ReadonlyMap<string, AdminCardRevocation>> {
  let row: { value: unknown } | null
  try {
    row = await db.keyValueSetting.findUnique({ where: { key: ADMIN_REVOKED_CARD_SETTING_KEY }, select: { value: true } })
  } catch {
    throw new RevokedCardPolicyError('configuration_unavailable', 'Unable to read admin card revocations')
  }
  return row ? parseAdminRegistry(row.value) : new Map()
}

type AdminRegistryTx = Pick<ExtendedPrismaClient, 'keyValueSetting' | '$executeRaw'>

/** Serialises admin revocation writes; the row may not exist yet, so lock the key, not the row. */
async function lockAdminRegistry(tx: AdminRegistryTx): Promise<Map<string, AdminCardRevocation>> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADMIN_REVOKED_CARD_SETTING_KEY}))`
  const row = await tx.keyValueSetting.findUnique({ where: { key: ADMIN_REVOKED_CARD_SETTING_KEY }, select: { value: true } })
  return row ? parseAdminRegistry(row.value) : new Map()
}

async function writeAdminRegistry(tx: AdminRegistryTx, cards: Map<string, AdminCardRevocation>): Promise<void> {
  const value = { cards: Object.fromEntries(cards) } as unknown as Prisma.InputJsonObject
  parseAdminRegistry(value)
  await tx.keyValueSetting.upsert({
    where: { key: ADMIN_REVOKED_CARD_SETTING_KEY },
    create: { key: ADMIN_REVOKED_CARD_SETTING_KEY, value },
    update: { value },
  })
}

/**
 * Records an admin revocation. The caller has locked the customer row and detaches the number
 * from it in the same transaction. Returns false when the number is already revoked (batch or
 * admin), which changes nothing. The batch row is only read, never written.
 */
export async function recordAdminCardRevocation(
  tx: AdminRegistryTx,
  input: { cardNumber: string; userId: string; revokedBy: string; reason: string; now?: Date },
): Promise<boolean> {
  const cardNumber = normalizeCardNumber(input.cardNumber)
  if (!cardNumber) invalid('Card number is empty')
  if (FORBIDDEN_CARDS.has(cardNumber)) {
    throw new RevokedCardPolicyError('card_protected', 'This card number is handled outside the registry')
  }
  const cards = await lockAdminRegistry(tx)
  if (cards.has(cardNumber) || (await getRevokedCardPolicy(tx)).cards.has(cardNumber)) return false
  cards.set(cardNumber, {
    userId: input.userId,
    revokedAt: (input.now ?? new Date()).toISOString(),
    revokedBy: input.revokedBy,
    reason: input.reason.trim().slice(0, REVOKE_REASON_MAX_LENGTH),
  })
  await writeAdminRegistry(tx, cards)
  return true
}

/** Removes an admin revocation. Batch (2026-11-16) cards are not in this row and roll back only as a whole. */
export async function removeAdminCardRevocation(tx: AdminRegistryTx, cardNumberInput: string): Promise<AdminCardRevocation> {
  const cardNumber = normalizeCardNumber(cardNumberInput)
  const cards = await lockAdminRegistry(tx)
  const entry = cards.get(cardNumber)
  if (!entry) throw new RevokedCardPolicyError('not_restorable', 'Only cards revoked from the admin panel can be restored')
  cards.delete(cardNumber)
  await writeAdminRegistry(tx, cards)
  return entry
}

export function isRevokedCardPolicyError(error: unknown, code?: RevokedCardPolicyError['code']): error is RevokedCardPolicyError {
  return error instanceof RevokedCardPolicyError && (code === undefined || error.code === code)
}

/** Test-only cache reset; it never changes database state. */
export function resetRevokedCardPolicyCache(): void {
  cache = null
}
