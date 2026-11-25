import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { normalizeCardNumber } from '@/lib/card-number'
import { carryMarketingSuppression, getMarketingSuppressions, marketingSuppressionKey } from '@/lib/marketing-suppression'
import { newShopOrderSql } from '@/lib/order-origin-sql'
import { getAdminCardRevocations, getRevokedCardPolicy } from '@/lib/revoked-card-policy'
import {
  KEPT_REFERENCES,
  LEGAL_FIELDS,
  MOVED_REFERENCES,
  USER_REFERENCES,
  referenceKey,
  type MergeBlocker,
  type UserReference,
} from '@/lib/admin-account-merge-references'
import type { MergeReasonCode } from '@/lib/admin-account-merge-reason'

export type { MergeBlocker } from '@/lib/admin-account-merge-references'

/**
 * Admin «Объединить аккаунты»: folds a legacy customer account without a card (the "source",
 * typically a nopCommerce import) into the customer's card account (the "target"), so the
 * source's email can live on the card account.
 *
 * Only an explicit admin request for one source/target pair merges anything; nothing is
 * merged automatically. The first stage is narrow: anything that cannot be moved and restored
 * exactly (sessions, tokens, bonus ledgers, company or staff links, legal details, conflicting
 * checkout profiles, open new-shop orders…) refuses the merge; such cases are resolved by hand.
 *
 * Concurrency: the merge holds FOR UPDATE on both User rows. Columns with a foreign key wait on
 * that lock by themselves; writers of plain user-id columns take the owner lock
 * (lib/account-owner-lock). After moving, every reference to the source is counted again and
 * must be zero before the source row is deleted.
 *
 * Recovery: KeyValueSetting `account-merge:v1:<sourceId>` (record version 2) keeps, as stored
 * by PostgreSQL (to_jsonb), the full source row without secrets, the target columns before the
 * merge, the ids of every moved row, every dropped duplicate row in full and every side effect.
 * lib/admin-account-merge-restore puts all of it back. The audit log only says who merged what.
 */

/**
 * READ COMMITTED on purpose: the merge waits on row locks, and every statement after a wait must
 * see what the lock holder committed (e.g. an order a checkout inserted under the owner lock).
 * A SERIALIZABLE snapshot is taken before that wait and would miss such a row; SSI cannot catch it
 * either, because the writers run in READ COMMITTED. Safety comes from the explicit locks.
 */
export const ACCOUNT_MERGE_TRANSACTION = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 } as const

export const ACCOUNT_MERGE_RECORD_PREFIX = 'account-merge:v1:'
export const ACCOUNT_MERGE_RECORD_VERSION = 2

/** User columns never copied into the recovery record, the audit log or an API response. */
export const SECRET_USER_FIELDS = [
  'passwordHash', 'mfaSecret', 'mfaBackupCodes', 'pkLast3', 'cardRecoveryEmailHash', 'cardRecoveryPhoneHash',
] as const

/** Target columns a merge may change; restored from the record on undo. */
export const TARGET_RESTORE_COLUMNS = [
  'email', 'name', 'phone', 'avatarUrl', 'checkoutProfile',
  'marketingConsent', 'marketingConsentAt', 'notificationChannel', 'notificationsSubscribed', 'updatedAt',
] as const

export type MergeUserRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  avatarUrl: string | null
  cardNumber: string | null
  pkLast3: string | null
  platformRole: string
  teamRole: string | null
  superAdmin: boolean
  companyId: string | null
  companyName: string | null
  customerType: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  bonusPoints: number
  mustChangePassword: boolean
  privacyAcknowledgedAt: Date | null
  marketingConsent: boolean
  marketingConsentAt: Date | null
  notificationChannel: string
  notificationsSubscribed: boolean
  mfaEnabled: boolean
  mfaSecret: string | null
  mfaBackupCodes: string[]
  cardRecoveryEmailHash: string | null
  cardRecoveryPhoneHash: string | null
  checkoutProfile: unknown
  createdAt: Date
  updatedAt: Date
}

const MERGE_USER_SELECT = {
  id: true, email: true, name: true, phone: true, avatarUrl: true, cardNumber: true, pkLast3: true,
  platformRole: true, teamRole: true, superAdmin: true, companyId: true, companyName: true, customerType: true,
  registrationNumber: true, vatNumber: true, legalAddress: true, bonusPoints: true, mustChangePassword: true,
  privacyAcknowledgedAt: true, marketingConsent: true, marketingConsentAt: true, notificationChannel: true,
  notificationsSubscribed: true, mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true,
  cardRecoveryEmailHash: true, cardRecoveryPhoneHash: true, checkoutProfile: true, createdAt: true, updatedAt: true,
} as const

export type ReferenceCounts = Record<string, number>

// ── Profile policy ────────────────────────────────────────────────────────────────────────────

export type ProfileAction = 'same' | 'keep_target' | 'copy_from_source' | 'conflict'
export type ProfileItem = 'name' | 'phone' | 'avatarUrl' | 'checkoutProfile' | 'marketingConsent' | 'notifications'
export type ProfilePlanEntry = { item: ProfileItem; action: ProfileAction; source: string | null; target: string | null }
export type ProfilePlan = { entries: ProfilePlanEntry[]; updates: Prisma.UserUpdateManyMutationInput; conflicts: ProfileItem[] }

const blank = (value: string | null | undefined): boolean => !value || !value.trim()
const emptyProfile = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0)
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}
const iso = (value: Date | null): string | null => (value ? value.toISOString() : null)
const notifications = (u: MergeUserRow) => `${u.notificationChannel}/${u.notificationsSubscribed ? 'subscribed' : 'not-subscribed'}`
const defaultNotifications = (u: MergeUserRow) => u.notificationChannel === 'app' && !u.notificationsSubscribed

/**
 * What happens to each profile value: kept from the card account, copied from the old account
 * (only where the card account has none), or a conflict that refuses the merge. Nothing is
 * dropped silently: every value is in the preview and the old account's row is in the record.
 */
export function planProfile(source: MergeUserRow, target: MergeUserRow): ProfilePlan {
  const entries: ProfilePlanEntry[] = []
  const updates: Prisma.UserUpdateManyMutationInput = {}
  const text = (item: 'name' | 'phone' | 'avatarUrl') => {
    const s = source[item]
    const t = target[item]
    const action: ProfileAction = (s ?? '') === (t ?? '') ? 'same' : blank(s) ? 'keep_target' : blank(t) ? 'copy_from_source' : 'keep_target'
    if (action === 'copy_from_source') updates[item] = s
    entries.push({ item, action, source: s, target: t })
  }
  text('name')
  text('phone')
  text('avatarUrl')

  const sp = source.checkoutProfile
  const tp = target.checkoutProfile
  const profileAction: ProfileAction = stable(sp ?? null) === stable(tp ?? null)
    ? 'same'
    : emptyProfile(sp) ? 'keep_target' : emptyProfile(tp) ? 'copy_from_source' : 'conflict'
  if (profileAction === 'copy_from_source') updates.checkoutProfile = sp as Prisma.InputJsonValue
  entries.push({ item: 'checkoutProfile', action: profileAction, source: emptyProfile(sp) ? null : 'set', target: emptyProfile(tp) ? null : 'set' })

  const consentSame = source.marketingConsent === target.marketingConsent && iso(source.marketingConsentAt) === iso(target.marketingConsentAt)
  const consentAction: ProfileAction = consentSame ? 'same' : source.marketingConsent && !target.marketingConsent ? 'copy_from_source' : 'keep_target'
  if (consentAction === 'copy_from_source') {
    updates.marketingConsent = true
    updates.marketingConsentAt = source.marketingConsentAt
  }
  const consent = (u: MergeUserRow) => `${u.marketingConsent ? 'yes' : 'no'}${u.marketingConsentAt ? ` (${u.marketingConsentAt.toISOString().slice(0, 10)})` : ''}`
  entries.push({ item: 'marketingConsent', action: consentAction, source: consent(source), target: consent(target) })

  const notifyAction: ProfileAction = notifications(source) === notifications(target)
    ? 'same'
    : defaultNotifications(source) ? 'keep_target' : defaultNotifications(target) ? 'copy_from_source' : 'keep_target'
  if (notifyAction === 'copy_from_source') {
    updates.notificationChannel = source.notificationChannel
    updates.notificationsSubscribed = source.notificationsSubscribed
  }
  entries.push({ item: 'notifications', action: notifyAction, source: notifications(source), target: notifications(target) })

  return { entries, updates, conflicts: entries.filter((e) => e.action === 'conflict').map((e) => e.item) }
}

// ── Blockers ──────────────────────────────────────────────────────────────────────────────────

const isErased = (user: Pick<MergeUserRow, 'email' | 'cardRecoveryEmailHash' | 'cardRecoveryPhoneHash'>): boolean =>
  user.email.toLowerCase().endsWith('@deleted.invalid') || user.cardRecoveryEmailHash !== null || user.cardRecoveryPhoneHash !== null

const isPlaceholderEmail = (email: string): boolean => email.toLowerCase().endsWith('@client.local')

export type BlockerInput = {
  source: MergeUserRow
  target: MergeUserRow
  sourceReferences: ReferenceCounts
  sourceSettingsReferences: number
  sourceOpenOrders: number
  targetPendingTokens: number
  sourceHasRevokedCard: boolean
  targetCardRevoked: boolean
  profileConflicts: ProfileItem[]
}

/** Every rule that stops a merge, in a stable order. Pure: the route and the tests share it. */
export function evaluateMergeBlockers(input: BlockerInput): MergeBlocker[] {
  const { source, target } = input
  const blockers = new Set<MergeBlocker>()
  if (source.id === target.id) blockers.add('same_account')
  if (isProtectedStaffAccount(source) || isProtectedStaffAccount(target)) blockers.add('staff_account')
  if (source.platformRole !== 'customer' || target.platformRole !== 'customer') blockers.add('not_customer')

  if (source.cardNumber) blockers.add('source_has_card')
  if (isPlaceholderEmail(source.email)) blockers.add('source_no_email')
  if (isErased(source)) blockers.add('source_erased')
  if (input.sourceHasRevokedCard) blockers.add('source_revoked_card')
  // Activated = took part in the new shop's account flow. Such an account may be in use.
  if (source.privacyAcknowledgedAt !== null || !source.mustChangePassword || source.mfaEnabled) blockers.add('source_activated')
  // Secrets are never stored in the recovery record, so an account holding any (other than the
  // never-used imported password hash) could not be restored exactly.
  if (source.pkLast3 !== null || source.mfaSecret !== null || source.mfaBackupCodes.length > 0) blockers.add('source_secrets')
  if (source.companyId !== null) blockers.add('source_company')
  if (source.customerType === 'company' || LEGAL_FIELDS.some((field) => !blank(source[field]))) blockers.add('source_legal_details')
  if (source.bonusPoints !== 0) blockers.add('source_bonus_balance')
  for (const ref of USER_REFERENCES) {
    if (ref.policy !== 'block' || !input.sourceReferences[referenceKey(ref)]) continue
    blockers.add(ref.blocker ?? 'source_staff_history')
  }
  if (input.sourceSettingsReferences > 0) blockers.add('source_settings_reference')
  if (input.sourceOpenOrders > 0) blockers.add('source_open_orders')
  if (input.profileConflicts.length > 0) blockers.add('profile_conflict')

  if (!target.cardNumber) blockers.add('target_no_card')
  if (input.targetCardRevoked) blockers.add('target_card_revoked')
  if (isErased(target)) blockers.add('target_erased')
  if (input.targetPendingTokens > 0) blockers.add('target_pending_tokens')
  return [...blockers]
}

// ── Database reads ────────────────────────────────────────────────────────────────────────────

type Db = ExtendedTransactionClient

const ident = (name: string) => Prisma.raw(`"${name.replace(/"/gu, '')}"`)

function referenceCondition(ref: UserReference, userId: string, email: string): Prisma.Sql {
  const column = ident(ref.column)
  switch (ref.match) {
    case 'id': return Prisma.sql`${column} = ${userId}`
    case 'idOrEmail': return Prisma.sql`${column} IN (${userId}, ${email})`
    case 'voterKey': return Prisma.sql`${column} = ${`user:${userId}`}`
    case 'auditSubject': return Prisma.sql`${column} = ${userId} AND "entityType" = 'user'`
  }
}

/** Row counts of every user reference for one account, in one query. Identifiers come from the constant registry. */
export async function countUserReferences(db: Pick<Db, '$queryRaw'>, userId: string, email: string): Promise<ReferenceCounts> {
  const columns = USER_REFERENCES.map((ref) => Prisma.sql`(SELECT count(*) FROM ${ident(ref.table)} WHERE ${referenceCondition(ref, userId, email)})::int AS ${ident(referenceKey(ref))}`)
  const [row] = await db.$queryRaw<Array<Record<string, number>>>`SELECT ${Prisma.join(columns, ', ')}`
  return Object.fromEntries(USER_REFERENCES.map((ref) => [referenceKey(ref), Number(row?.[referenceKey(ref)] ?? 0)]))
}

/** Settings rows (KeyValueSetting) whose key or JSON value mention the account id. */
async function countSettingsReferences(db: Pick<Db, '$queryRaw'>, userId: string): Promise<number> {
  const recordKey = `${ACCOUNT_MERGE_RECORD_PREFIX}${userId}`
  const [row] = await db.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM "KeyValueSetting"
    WHERE key <> ${recordKey} AND (strpos(key, ${userId}) > 0 OR strpos(value::text, ${userId}) > 0)`
  return Number(row?.n ?? 0)
}

/** New-shop orders that a payment, refund or stock job may still change. */
async function countOpenOrders(db: Pick<Db, '$queryRaw'>, userId: string): Promise<number> {
  const [row] = await db.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM "Order" o
    WHERE o."userId" = ${userId} AND ${newShopOrderSql}
      AND (o."paymentStatus" NOT IN ('paid', 'refunded') OR o."stockReservationStatus" = 'reserved')`
  return Number(row?.n ?? 0)
}

/** Open invitations and password resets of the kept account: an email change would void them. */
async function countTargetPendingTokens(db: Pick<Db, '$queryRaw'>, userId: string): Promise<number> {
  const [row] = await db.$queryRaw<Array<{ n: number }>>`
    SELECT ((SELECT count(*) FROM "InvitationToken" WHERE "userId" = ${userId} AND status <> 'accepted')
          + (SELECT count(*) FROM "PasswordResetToken" WHERE "userId" = ${userId}))::int AS n`
  return Number(row?.n ?? 0)
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

export class AccountMergeError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly blockers: MergeBlocker[] = []) {
    super(code)
  }
}

type LoadedState = {
  source: MergeUserRow
  target: MergeUserRow
  sourceReferences: ReferenceCounts
  profile: ProfilePlan
  blockers: MergeBlocker[]
}

async function loadState(db: Db, sourceId: string, targetId: string): Promise<LoadedState> {
  const [source, target] = await Promise.all([
    db.user.findUnique({ where: { id: sourceId }, select: MERGE_USER_SELECT }),
    db.user.findUnique({ where: { id: targetId }, select: MERGE_USER_SELECT }),
  ]) as [MergeUserRow | null, MergeUserRow | null]
  if (!source || !target) throw new AccountMergeError('not_found', 404)
  const [sourceReferences, sourceSettingsReferences, sourceOpenOrders, targetPendingTokens, revocations] = await Promise.all([
    countUserReferences(db, sourceId, source.email),
    countSettingsReferences(db, sourceId),
    countOpenOrders(db, sourceId),
    countTargetPendingTokens(db, targetId),
    revocationState(db, source, target),
  ])
  const profile = planProfile(source, target)
  const blockers = evaluateMergeBlockers({
    source, target, sourceReferences, sourceSettingsReferences, sourceOpenOrders, targetPendingTokens,
    profileConflicts: profile.conflicts, ...revocations,
  })
  return { source, target, sourceReferences, profile, blockers }
}

// ── Preview ───────────────────────────────────────────────────────────────────────────────────

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
  transfer: { orders: MergeOrderSummary[]; counts: Record<string, number>; duplicates: Record<string, number>; kept: Record<string, number> }
  profile: ProfilePlanEntry[]
  result: { email: string; name: string | null; phone: string | null; cardNumber: string | null; bonusPoints: number; marketingSuppressed: boolean }
  blockers: MergeBlocker[]
}

function summary(user: MergeUserRow, suppressed: boolean): MergeAccountSummary {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, cardNumber: user.cardNumber,
    bonusPoints: user.bonusPoints, registered: user.privacyAcknowledgedAt !== null,
    createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(), marketingSuppressed: suppressed,
  }
}

async function countDuplicates(db: Pick<Db, '$queryRaw'>, sourceId: string, targetId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const ref of MOVED_REFERENCES.filter((r) => r.uniqueWith)) {
    const table = ident(ref.table)
    const [row] = await db.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM ${table} s
      WHERE s."userId" = ${sourceId} AND EXISTS (SELECT 1 FROM ${table} t WHERE t."userId" = ${targetId} AND t."productId" = s."productId")`
    result[referenceKey(ref)] = Number(row?.n ?? 0)
  }
  return result
}

/** Read-only preview for the confirmation dialog. */
export async function buildMergePreview(db: Db, sourceId: string, targetId: string): Promise<MergePreview> {
  const { source, target, sourceReferences, profile, blockers } = await loadState(db, sourceId, targetId)
  const [orders, duplicates, suppressions] = await Promise.all([
    db.order.findMany({
      where: { userId: sourceId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, createdAt: true, total: true, paymentStatus: true },
    }),
    countDuplicates(db, sourceId, targetId),
    getMarketingSuppressions([source.email, target.email], db),
  ])
  const suppressed = (email: string) => suppressions.has(email.trim().toLowerCase())
  const value = (item: ProfileItem) => {
    const entry = profile.entries.find((e) => e.item === item)
    return entry?.action === 'copy_from_source' ? entry.source : entry?.target ?? null
  }
  return {
    source: summary(source, suppressed(source.email)),
    target: summary(target, suppressed(target.email)),
    transfer: {
      orders: orders.map((order) => ({
        id: order.id, createdAt: order.createdAt.toISOString(), total: order.total.toFixed(2), paymentStatus: order.paymentStatus,
      })),
      counts: Object.fromEntries(MOVED_REFERENCES.map((ref) => [referenceKey(ref), sourceReferences[referenceKey(ref)]])),
      duplicates,
      kept: Object.fromEntries(KEPT_REFERENCES.map((ref) => [referenceKey(ref), sourceReferences[referenceKey(ref)]])),
    },
    profile: profile.entries,
    result: {
      email: source.email, name: value('name'), phone: value('phone'), cardNumber: target.cardNumber,
      bonusPoints: target.bonusPoints,
      // The block is keyed by email: the source's own entry stays, the target's old one is carried.
      marketingSuppressed: suppressed(source.email) || suppressed(target.email),
    },
    blockers,
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────────────────────

export type MergeInput = {
  sourceId: string
  targetId: string
  sourceUpdatedAt: string
  targetUpdatedAt: string
  reasonCode: MergeReasonCode
  note: string | null
  actor: { id: string; email: string }
  now?: Date
}

/** The recovery record (KeyValueSetting value). Rows are PostgreSQL to_jsonb output. */
export type MergeRecoveryRecord = {
  version: 2
  mergedAt: string
  mergedBy: { id: string; email: string }
  reasonCode: MergeReasonCode
  note: string | null
  sourceId: string
  targetId: string
  /** Full source row; secrets removed (see SECRET_USER_FIELDS — all but the password hash were null). */
  source: Record<string, unknown>
  omittedSecrets: string[]
  /** Target columns the merge may change, before and right after the merge. */
  targetBefore: Record<string, unknown>
  targetAfter: { email: string; updatedAt: string }
  /** referenceKey → ids of rows moved from source to target. */
  movedIds: Record<string, string[]>
  /** referenceKey → full rows of the source deleted as duplicates of the target's rows. */
  dropped: Record<string, Array<Record<string, unknown>>>
  /** Immutable history left pointing at the source id (counts). */
  kept: Record<string, number>
  sideEffects: { suppressionCreated: { key: string; value: unknown } | null }
}

export type MergeOutcome =
  | { alreadyMerged: true; targetId: string }
  | {
      alreadyMerged: false
      targetId: string
      email: string
      moved: Record<string, number>
      dropped: Record<string, number>
      profileCopied: string[]
      previousTargetEmail: string
      suppressionCarried: boolean
      recoveryKey: string
    }

const secretsOut = Prisma.raw(SECRET_USER_FIELDS.map((field) => `- '${field}'`).join(' '))

export async function userJson(tx: Pick<Db, '$queryRaw'>, id: string): Promise<Record<string, unknown>> {
  const [row] = await tx.$queryRaw<Array<{ row: Record<string, unknown> }>>`SELECT to_jsonb(u) ${secretsOut} AS row FROM "User" u WHERE id = ${id}`
  if (!row) throw new AccountMergeError('concurrent_update', 409)
  return row.row
}

/**
 * Runs inside the caller's transaction (the caller appends the audit row). Throws
 * AccountMergeError for every refusal; nothing is written unless all checks pass.
 */
export async function executeAccountMerge(tx: Db, input: MergeInput): Promise<MergeOutcome> {
  const { sourceId, targetId } = input
  if (sourceId === targetId) throw new AccountMergeError('blocked', 409, ['same_account'])
  const recoveryKey = `${ACCOUNT_MERGE_RECORD_PREFIX}${sourceId}`

  // Waiting writers or merges fail fast instead of piling up behind each other.
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`
  // Same lock order for every merge (by id), so two merges sharing an account cannot deadlock.
  // FOR UPDATE also holds back every writer of a reference to either account (FK or owner lock).
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User" WHERE id IN (${sourceId}, ${targetId}) ORDER BY id FOR UPDATE`

  // A retried request after a successful merge: the source is gone, its recovery record is not.
  const previous = await tx.keyValueSetting.findUnique({ where: { key: recoveryKey }, select: { value: true } })
  if (previous) {
    const mergedInto = (previous.value as { targetId?: unknown } | null)?.targetId
    if (mergedInto === targetId && !locked.some((row) => row.id === sourceId)) return { alreadyMerged: true, targetId }
    throw new AccountMergeError('already_merged', 409)
  }
  if (locked.length !== 2) throw new AccountMergeError('not_found', 404)

  const state = await loadState(tx, sourceId, targetId)
  const { source, target, profile } = state
  if (source.updatedAt.getTime() !== new Date(input.sourceUpdatedAt).getTime()
    || target.updatedAt.getTime() !== new Date(input.targetUpdatedAt).getTime()) {
    throw new AccountMergeError('optimistic_conflict', 409)
  }
  if (state.blockers.length > 0) throw new AccountMergeError('blocked', 409, state.blockers)

  const sourceRow = await userJson(tx, sourceId)
  const targetRow = await userJson(tx, targetId)
  const targetBefore = Object.fromEntries(Object.entries(targetRow).filter(([key]) => (TARGET_RESTORE_COLUMNS as readonly string[]).includes(key)))

  // 1. Duplicates (same product already on the target) are deleted, kept in full for undo.
  const dropped: MergeRecoveryRecord['dropped'] = {}
  for (const ref of MOVED_REFERENCES.filter((r) => r.uniqueWith)) {
    const table = ident(ref.table)
    const rows = await tx.$queryRaw<Array<{ row: Record<string, unknown> }>>`
      DELETE FROM ${table} s
      WHERE s."userId" = ${sourceId} AND EXISTS (SELECT 1 FROM ${table} t WHERE t."userId" = ${targetId} AND t."productId" = s."productId")
      RETURNING to_jsonb(s) AS row`
    dropped[referenceKey(ref)] = rows.map((r) => r.row)
  }

  // 2. Owner data moves to the kept account.
  const movedIds: Record<string, string[]> = {}
  for (const ref of MOVED_REFERENCES) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE ${ident(ref.table)} SET ${ident(ref.column)} = ${targetId} WHERE ${ident(ref.column)} = ${sourceId} RETURNING id`
    movedIds[referenceKey(ref)] = rows.map((r) => r.id).sort()
  }

  // 3. Nothing may still point at the source (a writer that skipped the owner lock, a new table).
  const remaining = await countUserReferences(tx, sourceId, source.email)
  const kept = Object.fromEntries(KEPT_REFERENCES.map((ref) => [referenceKey(ref), remaining[referenceKey(ref)]]))
  if (USER_REFERENCES.some((ref) => ref.policy !== 'keep' && remaining[referenceKey(ref)] !== 0)) {
    throw new AccountMergeError('concurrent_update', 409)
  }

  // 4. Source goes, then the email is free for the target.
  const removed = await tx.user.deleteMany({ where: { id: sourceId, updatedAt: source.updatedAt, cardNumber: null } })
  if (removed.count !== 1) throw new AccountMergeError('concurrent_update', 409)
  const updated = await tx.user.updateMany({
    where: { id: targetId, updatedAt: target.updatedAt },
    data: { email: source.email, ...profile.updates },
  })
  if (updated.count !== 1) throw new AccountMergeError('concurrent_update', 409)

  // 5. «Рассылки запрещены» of the target's old address follows the person to the new one.
  const suppressionCarried = await carryMarketingSuppression(tx, target.email, source.email)
  const suppressionKey = marketingSuppressionKey(source.email)
  const suppressionCreated = suppressionCarried
    ? { key: suppressionKey, value: (await tx.keyValueSetting.findUnique({ where: { key: suppressionKey }, select: { value: true } }))?.value ?? null }
    : null

  // 6. Recovery record: everything needed to put the database back as it was.
  const after = await userJson(tx, targetId)
  const record: MergeRecoveryRecord = {
    version: ACCOUNT_MERGE_RECORD_VERSION,
    mergedAt: (input.now ?? new Date()).toISOString(),
    mergedBy: input.actor,
    reasonCode: input.reasonCode,
    note: input.note,
    sourceId,
    targetId,
    source: sourceRow,
    omittedSecrets: [...SECRET_USER_FIELDS],
    targetBefore,
    targetAfter: { email: String(after.email), updatedAt: String(after.updatedAt) },
    movedIds,
    dropped,
    kept,
    sideEffects: { suppressionCreated },
  }
  await tx.keyValueSetting.create({ data: { key: recoveryKey, value: record as unknown as Prisma.InputJsonObject } })

  return {
    alreadyMerged: false,
    targetId,
    email: source.email,
    moved: Object.fromEntries(Object.entries(movedIds).map(([key, ids]) => [key, ids.length])),
    dropped: Object.fromEntries(Object.entries(dropped).map(([key, rows]) => [key, rows.length])),
    profileCopied: profile.entries.filter((e) => e.action === 'copy_from_source').map((e) => e.item),
    previousTargetEmail: target.email,
    suppressionCarried,
    recoveryKey,
  }
}
