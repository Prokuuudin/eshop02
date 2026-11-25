import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { syncCheckoutProfile } from '@/lib/admin-customer-details'
import { normalizeCardNumber } from '@/lib/card-number'
import { carryMarketingSuppression, getMarketingSuppressions } from '@/lib/marketing-suppression'
import { getAdminCardRevocations, getRevokedCardPolicy } from '@/lib/revoked-card-policy'

/**
 * Admin «Объединить аккаунты»: folds a legacy customer account without a card (the "source",
 * typically a nopCommerce import) into the customer's card account (the "target"), so the
 * source's email can live on the card account.
 *
 * Only an explicit admin request for one source/target pair merges anything; nothing is
 * merged automatically (not even on an exact name match). First stage is deliberately narrow:
 * a source that was ever activated, has sessions, invitations, pending tokens, bonus points or
 * bonus history, or belongs to a company is refused, and is resolved by hand.
 *
 * One serializable transaction: lock both rows, re-check every rule on the locked state, move
 * the source's history (orders, addresses, wishlist, product news, promo redemptions,
 * notifications) onto the target, write a recovery record, delete the source, give the target
 * the source's email. The recovery record (KeyValueSetting `account-merge:v1:<sourceId>`) is
 * the restore data — the audit log only says who merged what. Neither holds secrets.
 */

/** What a merge does with every column that stores a User id. The schema test keeps this complete. */
export const USER_REFERENCE_HANDLING = {
  'Order.userId': 'move',
  'SavedAddress.userId': 'move',
  'WishlistItem.userId': 'move',
  'ProductNewsSubscription.userId': 'move',
  'PromoCodeRedemption.userId': 'move',
  'UserNotification.userId': 'move',
  'Session.userId': 'block',
  'PasswordResetToken.userId': 'block',
  'MfaChallenge.userId': 'block',
  'InvitationToken.userId': 'block',
  'InvitationDelivery.userId': 'block',
  'BonusTransaction.userId': 'block',
  'BonusTransaction.actorUserId': 'block',
  'CompanyMember.userId': 'block',
  'CompanyActivityLog.userId': 'block',
  'RFQRequest.createdByUserId': 'block',
  'AccountManagerMessage.authorId': 'block',
  'AuditLog.actorUserId': 'block',
  'AccessRequest.reviewedByUserId': 'block',
  'AdminRoleChangeRequest.targetUserId': 'block',
  'AdminRoleChangeRequest.requestedByUserId': 'block',
  'AdminRoleChangeRequest.approvedByUserId': 'block',
} as const

export type UserReference = keyof typeof USER_REFERENCE_HANDLING
export type ReferenceCounts = Record<UserReference, number>

const REFERENCES = Object.keys(USER_REFERENCE_HANDLING) as UserReference[]
const MOVED_REFERENCES = REFERENCES.filter((ref) => USER_REFERENCE_HANDLING[ref] === 'move')

/** User columns never copied into the recovery record, the audit log or an API response. */
export const SECRET_USER_FIELDS = [
  'passwordHash', 'mfaSecret', 'mfaBackupCodes', 'pkLast3', 'cardRecoveryEmailHash', 'cardRecoveryPhoneHash',
] as const

export const ACCOUNT_MERGE_RECORD_PREFIX = 'account-merge:v1:'
export const MERGE_REASON_MIN_LENGTH = 5
export const MERGE_REASON_MAX_LENGTH = 500

export type MergeBlocker =
  | 'same_account'
  | 'staff_account'
  | 'not_customer'
  | 'source_has_card'
  | 'source_no_email'
  | 'source_erased'
  | 'source_revoked_card'
  | 'source_activated'
  | 'source_company'
  | 'source_bonus_balance'
  | 'source_bonus_history'
  | 'source_sessions'
  | 'source_invitations'
  | 'source_pending_tokens'
  | 'source_linked_records'
  | 'target_no_card'
  | 'target_card_revoked'
  | 'target_erased'

export type MergeUserRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  cardNumber: string | null
  platformRole: string
  teamRole: string | null
  superAdmin: boolean
  companyId: string | null
  customerType: string | null
  bonusPoints: number
  mustChangePassword: boolean
  privacyAcknowledgedAt: Date | null
  mfaEnabled: boolean
  cardRecoveryEmailHash: string | null
  cardRecoveryPhoneHash: string | null
  checkoutProfile: unknown
  companyName: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  createdAt: Date
  updatedAt: Date
}

const MERGE_USER_SELECT = {
  id: true, email: true, name: true, phone: true, cardNumber: true, platformRole: true, teamRole: true,
  superAdmin: true, companyId: true, customerType: true, bonusPoints: true, mustChangePassword: true,
  privacyAcknowledgedAt: true, mfaEnabled: true, cardRecoveryEmailHash: true, cardRecoveryPhoneHash: true,
  checkoutProfile: true, companyName: true, registrationNumber: true, vatNumber: true, legalAddress: true,
  createdAt: true, updatedAt: true,
} as const

const isErased = (user: Pick<MergeUserRow, 'email' | 'cardRecoveryEmailHash' | 'cardRecoveryPhoneHash'>): boolean =>
  user.email.toLowerCase().endsWith('@deleted.invalid') || user.cardRecoveryEmailHash !== null || user.cardRecoveryPhoneHash !== null

const isPlaceholderEmail = (email: string): boolean => email.toLowerCase().endsWith('@client.local')

const REFERENCE_BLOCKERS: Partial<Record<UserReference, MergeBlocker>> = {
  'Session.userId': 'source_sessions',
  'InvitationToken.userId': 'source_invitations',
  'InvitationDelivery.userId': 'source_invitations',
  'PasswordResetToken.userId': 'source_pending_tokens',
  'MfaChallenge.userId': 'source_pending_tokens',
  'BonusTransaction.userId': 'source_bonus_history',
  'CompanyMember.userId': 'source_company',
  'CompanyActivityLog.userId': 'source_company',
  'RFQRequest.createdByUserId': 'source_company',
}

/** Every rule that stops a merge, in a stable order. Pure: the route and the tests share it. */
export function evaluateMergeBlockers(input: {
  source: MergeUserRow
  target: MergeUserRow
  sourceReferences: ReferenceCounts
  sourceHasRevokedCard: boolean
  targetCardRevoked: boolean
}): MergeBlocker[] {
  const { source, target, sourceReferences } = input
  const blockers = new Set<MergeBlocker>()
  if (source.id === target.id) blockers.add('same_account')
  if (isProtectedStaffAccount(source) || isProtectedStaffAccount(target)) blockers.add('staff_account')
  if (source.platformRole !== 'customer' || target.platformRole !== 'customer') blockers.add('not_customer')

  if (source.cardNumber) blockers.add('source_has_card')
  if (isPlaceholderEmail(source.email)) blockers.add('source_no_email')
  if (isErased(source)) blockers.add('source_erased')
  if (input.sourceHasRevokedCard) blockers.add('source_revoked_card')
  // Activated = took part in the new shop's account flow: accepted the privacy notice, set an
  // own password, or enrolled MFA. Such an account may be in use and is merged by hand only.
  if (source.privacyAcknowledgedAt !== null || !source.mustChangePassword || source.mfaEnabled) blockers.add('source_activated')
  if (source.companyId !== null) blockers.add('source_company')
  if (source.bonusPoints !== 0) blockers.add('source_bonus_balance')
  for (const ref of REFERENCES) {
    if (USER_REFERENCE_HANDLING[ref] !== 'block' || sourceReferences[ref] === 0) continue
    blockers.add(REFERENCE_BLOCKERS[ref] ?? 'source_linked_records')
  }

  if (!target.cardNumber) blockers.add('target_no_card')
  if (input.targetCardRevoked) blockers.add('target_card_revoked')
  if (isErased(target)) blockers.add('target_erased')
  return [...blockers]
}

type Db = ExtendedTransactionClient

/** Row counts of every User reference for one user, in one query. Identifiers come from the constant map above. */
export async function countUserReferences(db: Pick<Db, '$queryRaw'>, userId: string): Promise<ReferenceCounts> {
  const columns = REFERENCES.map((ref) => {
    const [table, column] = ref.split('.')
    return Prisma.sql`(SELECT count(*) FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${column}"`)} = ${userId})::int AS ${Prisma.raw(`"${ref}"`)}`
  })
  const [row] = await db.$queryRaw<Array<Record<string, number>>>`SELECT ${Prisma.join(columns, ', ')}`
  return Object.fromEntries(REFERENCES.map((ref) => [ref, Number(row?.[ref] ?? 0)])) as ReferenceCounts
}

async function revocationState(db: Db, source: MergeUserRow, target: MergeUserRow) {
  const [batch, admin] = await Promise.all([getRevokedCardPolicy(db), getAdminCardRevocations(db)])
  const holders = [...batch.cards.values(), ...admin.values()].map((entry) => entry.userId)
  const targetCard = normalizeCardNumber(target.cardNumber ?? '')
  return {
    sourceHasRevokedCard: holders.includes(source.id),
    targetCardRevoked: targetCard !== '' && (batch.cards.has(targetCard) || admin.has(targetCard)),
  }
}

export type MergeOrderSummary = { id: string; createdAt: string; total: string; paymentStatus: string }

export type MergeAccountSummary = {
  id: string
  name: string | null
  email: string
  phone: string | null
  cardNumber: string | null
  bonusPoints: number
  registered: boolean
  createdAt: string
  updatedAt: string
  marketingSuppressed: boolean
}

export type MergePreview = {
  source: MergeAccountSummary
  target: MergeAccountSummary
  transfer: { orders: MergeOrderSummary[]; counts: Record<string, number>; wishlistDuplicates: number; productNewsDuplicates: number }
  result: { email: string; name: string | null; phone: string | null; cardNumber: string | null; bonusPoints: number; marketingSuppressed: boolean }
  blockers: MergeBlocker[]
}

export class AccountMergeError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly blockers: MergeBlocker[] = []) {
    super(code)
  }
}

function summary(user: MergeUserRow, suppressed: boolean): MergeAccountSummary {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, cardNumber: user.cardNumber,
    bonusPoints: user.bonusPoints, registered: user.privacyAcknowledgedAt !== null,
    createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(), marketingSuppressed: suppressed,
  }
}

const blank = (value: string | null): boolean => !value || !value.trim()

/** Name and phone of the kept account after the merge: its own, or the source's when it has none. */
function resultContact(source: MergeUserRow, target: MergeUserRow) {
  return {
    name: blank(target.name) ? source.name : target.name,
    phone: blank(target.phone) ? source.phone : target.phone,
  }
}

async function duplicateProducts(db: Db, sourceId: string, targetId: string) {
  const [sourceWish, targetWish, sourceNews, targetNews] = await Promise.all([
    db.wishlistItem.findMany({ where: { userId: sourceId }, select: { id: true, productId: true } }),
    db.wishlistItem.findMany({ where: { userId: targetId }, select: { productId: true } }),
    db.productNewsSubscription.findMany({ where: { userId: sourceId }, select: { id: true, productId: true } }),
    db.productNewsSubscription.findMany({ where: { userId: targetId }, select: { productId: true } }),
  ])
  const wishTaken = new Set(targetWish.map((row) => row.productId))
  const newsTaken = new Set(targetNews.map((row) => row.productId))
  return {
    wishlistDuplicates: sourceWish.filter((row) => wishTaken.has(row.productId)),
    productNewsDuplicates: sourceNews.filter((row) => newsTaken.has(row.productId)),
  }
}

type LoadedState = {
  source: MergeUserRow
  target: MergeUserRow
  sourceReferences: ReferenceCounts
  blockers: MergeBlocker[]
}

async function loadState(db: Db, sourceId: string, targetId: string): Promise<LoadedState> {
  const [source, target] = await Promise.all([
    db.user.findUnique({ where: { id: sourceId }, select: MERGE_USER_SELECT }),
    db.user.findUnique({ where: { id: targetId }, select: MERGE_USER_SELECT }),
  ])
  if (!source || !target) throw new AccountMergeError('not_found', 404)
  const sourceReferences = await countUserReferences(db, sourceId)
  const revocations = await revocationState(db, source as MergeUserRow, target as MergeUserRow)
  const blockers = evaluateMergeBlockers({ source: source as MergeUserRow, target: target as MergeUserRow, sourceReferences, ...revocations })
  return { source: source as MergeUserRow, target: target as MergeUserRow, sourceReferences, blockers }
}

/** Read-only preview for the confirmation dialog. */
export async function buildMergePreview(db: Db, sourceId: string, targetId: string): Promise<MergePreview> {
  const { source, target, sourceReferences, blockers } = await loadState(db, sourceId, targetId)
  const [orders, duplicates, suppressions] = await Promise.all([
    db.order.findMany({
      where: { userId: sourceId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, createdAt: true, total: true, paymentStatus: true },
    }),
    duplicateProducts(db, sourceId, targetId),
    getMarketingSuppressions([source.email, target.email], db),
  ])
  const suppressed = (email: string) => suppressions.has(email.trim().toLowerCase())
  const contact = resultContact(source, target)
  return {
    source: summary(source, suppressed(source.email)),
    target: summary(target, suppressed(target.email)),
    transfer: {
      orders: orders.map((order) => ({
        id: order.id, createdAt: order.createdAt.toISOString(), total: order.total.toFixed(2), paymentStatus: order.paymentStatus,
      })),
      counts: Object.fromEntries(MOVED_REFERENCES.map((ref) => [ref, sourceReferences[ref]])),
      wishlistDuplicates: duplicates.wishlistDuplicates.length,
      productNewsDuplicates: duplicates.productNewsDuplicates.length,
    },
    result: {
      email: source.email, name: contact.name, phone: contact.phone, cardNumber: target.cardNumber,
      bonusPoints: target.bonusPoints,
      // The block is keyed by email: the source's own entry stays, the target's old one is carried.
      marketingSuppressed: suppressed(source.email) || suppressed(target.email),
    },
    blockers,
  }
}

function withoutSecrets<T extends Record<string, unknown>>(row: T): Omit<T, (typeof SECRET_USER_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...row }
  for (const field of SECRET_USER_FIELDS) delete copy[field]
  return copy as Omit<T, (typeof SECRET_USER_FIELDS)[number]>
}

export type MergeInput = {
  sourceId: string
  targetId: string
  sourceUpdatedAt: string
  targetUpdatedAt: string
  reason: string
  actor: { id: string; email: string }
  now?: Date
}

export type MergeOutcome =
  | { alreadyMerged: true; targetId: string }
  | {
      alreadyMerged: false
      targetId: string
      email: string
      moved: Record<string, number>
      dropped: { wishlist: number; productNews: number }
      emailChanged: boolean
      previousTargetEmail: string
      suppressionCarried: boolean
      recoveryKey: string
    }

/**
 * Runs inside the caller's serializable transaction (the caller appends the audit row).
 * Throws AccountMergeError for every refusal; nothing is written unless all checks pass.
 */
export async function executeAccountMerge(tx: Db, input: MergeInput): Promise<MergeOutcome> {
  const { sourceId, targetId } = input
  if (sourceId === targetId) throw new AccountMergeError('blocked', 409, ['same_account'])
  const recoveryKey = `${ACCOUNT_MERGE_RECORD_PREFIX}${sourceId}`

  // Same lock order for every merge (by id), so two merges sharing an account cannot deadlock.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User" WHERE id IN (${sourceId}, ${targetId}) ORDER BY id FOR UPDATE`

  // A retried request after a successful merge: the source is gone, its recovery record is not.
  const previous = await tx.keyValueSetting.findUnique({ where: { key: recoveryKey }, select: { value: true } })
  if (previous) {
    const mergedInto = (previous.value as { target?: { id?: unknown } } | null)?.target?.id
    if (mergedInto === targetId && !locked.some((row) => row.id === sourceId)) return { alreadyMerged: true, targetId }
    throw new AccountMergeError('already_merged', 409)
  }
  if (locked.length !== 2) throw new AccountMergeError('not_found', 404)

  const state = await loadState(tx, sourceId, targetId)
  const { source, target } = state
  if (source.updatedAt.getTime() !== new Date(input.sourceUpdatedAt).getTime()
    || target.updatedAt.getTime() !== new Date(input.targetUpdatedAt).getTime()) {
    throw new AccountMergeError('optimistic_conflict', 409)
  }
  if (state.blockers.length > 0) throw new AccountMergeError('blocked', 409, state.blockers)

  // Full source row for the recovery record, secrets stripped.
  const sourceRow = await tx.user.findUniqueOrThrow({ where: { id: sourceId } })
  const duplicates = await duplicateProducts(tx, sourceId, targetId)

  // 1. History moves to the kept account. Rows the target already has (same product) are dropped.
  const movedIds: Record<string, string[]> = {}
  const ids = async (rows: Promise<Array<{ id: string }>>) => (await rows).map((row) => row.id)
  movedIds['Order.userId'] = await ids(tx.order.findMany({ where: { userId: sourceId }, select: { id: true } }))
  movedIds['SavedAddress.userId'] = await ids(tx.savedAddress.findMany({ where: { userId: sourceId }, select: { id: true } }))
  movedIds['PromoCodeRedemption.userId'] = await ids(tx.promoCodeRedemption.findMany({ where: { userId: sourceId }, select: { id: true } }))
  movedIds['UserNotification.userId'] = await ids(tx.userNotification.findMany({ where: { userId: sourceId }, select: { id: true } }))
  const wishDropIds = duplicates.wishlistDuplicates.map((row) => row.id)
  const newsDropIds = duplicates.productNewsDuplicates.map((row) => row.id)
  movedIds['WishlistItem.userId'] = (await ids(tx.wishlistItem.findMany({ where: { userId: sourceId }, select: { id: true } })))
    .filter((id) => !wishDropIds.includes(id))
  movedIds['ProductNewsSubscription.userId'] = (await ids(tx.productNewsSubscription.findMany({ where: { userId: sourceId }, select: { id: true } })))
    .filter((id) => !newsDropIds.includes(id))

  if (wishDropIds.length) await tx.wishlistItem.deleteMany({ where: { id: { in: wishDropIds }, userId: sourceId } })
  if (newsDropIds.length) await tx.productNewsSubscription.deleteMany({ where: { id: { in: newsDropIds }, userId: sourceId } })
  const moveTo = { userId: targetId }
  const moved: Record<string, number> = {
    'Order.userId': (await tx.order.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
    'SavedAddress.userId': (await tx.savedAddress.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
    'WishlistItem.userId': (await tx.wishlistItem.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
    'ProductNewsSubscription.userId': (await tx.productNewsSubscription.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
    'PromoCodeRedemption.userId': (await tx.promoCodeRedemption.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
    'UserNotification.userId': (await tx.userNotification.updateMany({ where: { userId: sourceId }, data: moveTo })).count,
  }
  for (const ref of MOVED_REFERENCES) {
    if (moved[ref] !== movedIds[ref].length) throw new AccountMergeError('concurrent_update', 409)
  }

  // 2. Recovery record before the source row disappears. Not the audit log: this is the data.
  const contact = resultContact(source, target)
  const emailChanged = target.email !== source.email
  const now = input.now ?? new Date()
  const record = {
    version: 1,
    mergedAt: now.toISOString(),
    mergedBy: input.actor,
    reason: input.reason,
    source: withoutSecrets(sourceRow as unknown as Record<string, unknown>),
    target: {
      id: target.id, email: target.email, name: target.name, phone: target.phone,
      checkoutProfile: target.checkoutProfile ?? null, updatedAt: target.updatedAt.toISOString(),
    },
    movedIds,
    dropped: {
      wishlist: duplicates.wishlistDuplicates,
      productNews: duplicates.productNewsDuplicates,
    },
    restoreNote: 'Recreate the source user from `source` (new random password hash; the customer resets it), move `movedIds` back, re-insert `dropped`, restore `target` fields, then delete this record.',
  }
  await tx.keyValueSetting.create({ data: { key: recoveryKey, value: JSON.parse(JSON.stringify(record)) as Prisma.InputJsonObject } })

  // 3. Source goes (nothing references it any more), then the email is free for the target.
  const removed = await tx.user.deleteMany({ where: { id: sourceId, updatedAt: source.updatedAt, cardNumber: null } })
  if (removed.count !== 1) throw new AccountMergeError('concurrent_update', 409)

  const contactUpdates = {
    ...(contact.name !== target.name ? { name: contact.name } : {}),
    ...(contact.phone !== target.phone ? { phone: contact.phone } : {}),
  }
  const checkoutProfile = syncCheckoutProfile(target, contactUpdates)
  const updated = await tx.user.updateMany({
    where: { id: targetId, updatedAt: target.updatedAt },
    data: {
      email: source.email,
      ...contactUpdates,
      ...(checkoutProfile ? { checkoutProfile: checkoutProfile as Prisma.InputJsonObject } : {}),
    },
  })
  if (updated.count !== 1) throw new AccountMergeError('concurrent_update', 409)

  // 4. Same consequences as an admin email change (app/api/admin/users PATCH).
  let suppressionCarried = false
  if (emailChanged) {
    await tx.invitationToken.deleteMany({ where: { userId: targetId, status: { not: 'accepted' } } })
    await tx.passwordResetToken.deleteMany({ where: { userId: targetId } })
    suppressionCarried = await carryMarketingSuppression(tx, target.email, source.email)
  }

  return {
    alreadyMerged: false,
    targetId,
    email: source.email,
    moved,
    dropped: { wishlist: wishDropIds.length, productNews: newsDropIds.length },
    emailChanged,
    previousTargetEmail: target.email,
    suppressionCarried,
    recoveryKey,
  }
}
