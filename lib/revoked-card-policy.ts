import 'server-only'

import { createHash } from 'node:crypto'
import { z } from 'zod'

import { normalizeCardNumber } from '@/lib/card-number'
import { prisma, type ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export const REVOKED_CARD_SETTING_KEY = 'revoked-client-cards:v1'
/** Size of the 2026-11-16 batch. The registry may grow past it through admin revocations. */
export const REVOKED_CARD_BATCH_SIZE = 905
export const REVOKE_REASON_MAX_LENGTH = 500

const FORBIDDEN_CARDS = new Set(['111', '5044'])
const PRESERVED_LOGIN_CARD = '5555'

const entrySchema = z.object({
  userId: z.string().trim().min(1).max(200),
  preserveLogin: z.boolean(),
  // Set only on cards revoked from the admin panel; the 2026-11-16 batch entries have none.
  // Metadata stays outside the checksum, which covers the card-to-user mapping only.
  origin: z.literal('admin').optional(),
  revokedAt: z.iso.datetime().optional(),
  revokedBy: z.string().trim().min(1).max(200).optional(),
  reason: z.string().trim().min(1).max(REVOKE_REASON_MAX_LENGTH).optional(),
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
      | 'registry_inactive'
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
  // No fixed size: admin revocations add cards, and one customer may collect several revoked
  // cards over time (revoked, reissued, revoked again). The checksum guards the mapping.
  const normalizedCards: Record<string, RevokedCardEntry> = {}
  for (const [rawCardNumber, entry] of Object.entries(config.cards)) {
    const cardNumber = normalizeCardNumber(rawCardNumber)
    if (!cardNumber || cardNumber !== rawCardNumber) invalid(`Card number is not canonical: ${rawCardNumber}`)
    if (FORBIDDEN_CARDS.has(cardNumber)) invalid(`Protected card is present: ${cardNumber}`)
    if (normalizedCards[cardNumber]) invalid(`Duplicate normalized card: ${cardNumber}`)
    normalizedCards[cardNumber] = entry
  }

  if (computeRevokedCardChecksum(normalizedCards) !== config.checksum) invalid('Checksum mismatch')

  const preserved = Object.entries(normalizedCards).filter(([, entry]) => entry.preserveLogin)
  if (preserved.some(([cardNumber, entry]) => cardNumber !== PRESERVED_LOGIN_CARD || entry.origin === 'admin')) {
    invalid(`preserveLogin may be enabled only for batch card ${PRESERVED_LOGIN_CARD}`)
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
  const userIds = [...new Set([...policy.cards.values()].map((entry) => entry.userId))]

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
    // Admin revocations are checked when they are written (see revokeCardInRegistry).
    if (entry.origin === 'admin') continue
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
}

export async function isCardRevoked(cardNumber: string, db: PolicyDb = prisma): Promise<boolean> {
  const policy = await getRevokedCardPolicy(db)
  return policy.cards.has(normalizeCardNumber(cardNumber))
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
  if (next && next !== current && policy.cards.has(next)) {
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

type RegistryTx = Pick<ExtendedPrismaClient, 'keyValueSetting' | '$queryRaw'>

/**
 * Locks the registry row for the rest of the transaction and returns its validated state, so
 * concurrent admin revocations serialise instead of overwriting each other's JSON. No row yet
 * starts an empty active registry; a rolled-back (active=false) registry is never re-enabled
 * from the admin panel.
 */
type LockedRegistry = { cards: Record<string, RevokedCardEntry>; source: string }

async function lockRegistryForWrite(tx: RegistryTx): Promise<LockedRegistry> {
  await tx.$queryRaw`SELECT "key" FROM "KeyValueSetting" WHERE "key" = ${REVOKED_CARD_SETTING_KEY} FOR UPDATE`
  const row = await tx.keyValueSetting.findUnique({ where: { key: REVOKED_CARD_SETTING_KEY }, select: { value: true } })
  if (!row) return { cards: {}, source: 'admin-panel' }
  const state = row.value as Record<string, unknown> | null
  if (state && typeof state === 'object' && state.active === false) {
    throw new RevokedCardPolicyError('registry_inactive', 'Revoked-card registry is switched off')
  }
  const parsed = activeConfigSchema.safeParse(state)
  if (!parsed.success) invalid('Active setting has an invalid shape')
  return { cards: Object.fromEntries(validateActiveConfig(parsed.data).cards), source: parsed.data.source }
}

async function writeRegistry(tx: RegistryTx, { cards, source }: LockedRegistry): Promise<void> {
  const config: RevokedCardConfig = { active: true, source, checksum: computeRevokedCardChecksum(cards), cards }
  validateActiveConfig(config)
  const value = config as unknown as Prisma.InputJsonObject
  await tx.keyValueSetting.upsert({
    where: { key: REVOKED_CARD_SETTING_KEY },
    create: { key: REVOKED_CARD_SETTING_KEY, value },
    update: { value },
  })
}

/**
 * Adds one card to the registry as revoked by an admin. The caller has locked the customer row
 * and checked that `userId` holds (or held, for a replacement) this card. Returns false when the
 * number is already revoked, which changes nothing.
 */
export async function revokeCardInRegistry(
  tx: RegistryTx,
  input: { cardNumber: string; userId: string; revokedBy: string; reason: string; now?: Date },
): Promise<boolean> {
  const cardNumber = normalizeCardNumber(input.cardNumber)
  if (!cardNumber) invalid('Card number is empty')
  if (FORBIDDEN_CARDS.has(cardNumber)) {
    throw new RevokedCardPolicyError('card_protected', 'This card number is handled outside the registry')
  }
  const registry = await lockRegistryForWrite(tx)
  const { cards } = registry
  if (cards[cardNumber]) return false
  cards[cardNumber] = {
    userId: input.userId,
    preserveLogin: false,
    origin: 'admin',
    revokedAt: (input.now ?? new Date()).toISOString(),
    revokedBy: input.revokedBy,
    reason: input.reason.trim().slice(0, REVOKE_REASON_MAX_LENGTH),
  }
  await writeRegistry(tx, registry)
  return true
}

/** Removes an admin revocation. Batch (2026-11-16) entries stay: they roll back only as a whole. */
export async function restoreCardInRegistry(tx: RegistryTx, cardNumberInput: string): Promise<RevokedCardEntry> {
  const cardNumber = normalizeCardNumber(cardNumberInput)
  const registry = await lockRegistryForWrite(tx)
  const entry = registry.cards[cardNumber]
  if (!entry || entry.origin !== 'admin') {
    throw new RevokedCardPolicyError('not_restorable', 'Only cards revoked from the admin panel can be restored')
  }
  delete registry.cards[cardNumber]
  await writeRegistry(tx, registry)
  return entry
}

export function isRevokedCardPolicyError(error: unknown, code?: RevokedCardPolicyError['code']): error is RevokedCardPolicyError {
  return error instanceof RevokedCardPolicyError && (code === undefined || error.code === code)
}

/** Test-only cache reset; it never changes database state. */
export function resetRevokedCardPolicyCache(): void {
  cache = null
}
