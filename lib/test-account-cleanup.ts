import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { isStaffSubject } from '@/lib/admin-permissions'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

/**
 * One-off, idempotent clean-up of known test accounts (scripts/cleanup-test-accounts.ts).
 * Only these exact ids are ever touched; every other account, staff or not, is out of scope.
 * - neutralize: keep the user and its audit history; replace the password with an unknown
 *   random one, drop the MFA secret and end every session and pending credential.
 * - delete: remove an E2E fixture when its test origin is confirmed and it holds no business data.
 */
export const CLEANUP_RUN_ID = 'test-accounts-2026-11-12'
export const NEUTRALIZED_ACTION = 'user.test_account_neutralized'
export const DELETED_ACTION = 'user.test_account_deleted'

export type CleanupTarget = { id: string; email: string; action: 'neutralize' | 'delete'; origin: string }

export const CLEANUP_TARGETS: readonly CleanupTarget[] = [
  { id: 'seed_admin_001', email: 'admin@test.com', action: 'neutralize', origin: 'demo seed account (lib/auth-demo-accounts.ts)' },
  { id: 'u_e2e_admin_fixture', email: 'e2e-admin@hairshoppro.lv.local', action: 'delete', origin: 'E2E fixture E2E_ADMIN (e2e/helpers.ts)' },
  { id: 'u_e2e_manager_fixture', email: 'e2e-manager@hairshoppro.lv.local', action: 'delete', origin: 'E2E fixture E2E_MANAGER (e2e/helpers.ts)' },
  { id: 'u_e2e_customer_fixture', email: 'e2e-customer@hairshoppro.lv.local', action: 'delete', origin: 'E2E fixture E2E_CUSTOMER (e2e/helpers.ts)' },
]

type ReferenceKind = 'credential' | 'auxiliary' | 'history' | 'business'
type Reference = { table: string; column: string; kind: ReferenceKind; byEmail?: boolean }

/**
 * credential: removed for both actions (sessions, MFA challenges, reset and invitation tokens).
 * auxiliary: test-run leftovers removed with a deleted fixture. history: kept (AuditLog).
 * business: any row blocks deletion. A foreign key to "User" missing here counts as business.
 */
export const USER_REFERENCES: readonly Reference[] = [
  { table: 'Session', column: 'userId', kind: 'credential' },
  { table: 'MfaChallenge', column: 'userId', kind: 'credential' },
  { table: 'PasswordResetToken', column: 'userId', kind: 'credential' },
  { table: 'InvitationToken', column: 'userId', kind: 'credential' },
  { table: 'InvitationDelivery', column: 'userId', kind: 'auxiliary' },
  { table: 'UserNotification', column: 'userId', kind: 'auxiliary' },
  { table: 'WishlistItem', column: 'userId', kind: 'auxiliary' },
  { table: 'SavedAddress', column: 'userId', kind: 'auxiliary' },
  { table: 'ProductNewsSubscription', column: 'userId', kind: 'auxiliary' },
  { table: 'AuditLog', column: 'actorUserId', kind: 'history' },
  { table: 'Order', column: 'userId', kind: 'business' },
  { table: 'Order', column: 'email', kind: 'business', byEmail: true },
  { table: 'ReturnRequest', column: 'email', kind: 'business', byEmail: true },
  { table: 'BonusTransaction', column: 'userId', kind: 'business' },
  { table: 'BonusTransaction', column: 'actorUserId', kind: 'business' },
  { table: 'PromoCodeRedemption', column: 'userId', kind: 'business' },
  { table: 'CompanyMember', column: 'userId', kind: 'business' },
  { table: 'CompanyMember', column: 'addedBy', kind: 'business' },
  { table: 'AccountManagerMessage', column: 'authorId', kind: 'business' },
  { table: 'CompanyActivityLog', column: 'userId', kind: 'business' },
  { table: 'AccessRequest', column: 'reviewedByUserId', kind: 'business' },
  { table: 'RFQRequest', column: 'createdByUserId', kind: 'business' },
  { table: 'AdminRoleChangeRequest', column: 'targetUserId', kind: 'business' },
  { table: 'AdminRoleChangeRequest', column: 'requestedByUserId', kind: 'business' },
  { table: 'AdminRoleChangeRequest', column: 'approvedByUserId', kind: 'business' },
]

export type TargetUser = {
  id: string; email: string; name: string | null; platformRole: string; teamRole: string | null
  superAdmin: boolean; bonusPoints: number; hasCard: boolean; mustChangePassword: boolean
  mfaEnabled: boolean; hasMfaSecret: boolean; mfaBackupCodeCount: number; createdAt: string; updatedAt: string
}
export type ReferenceCount = { table: string; column: string; kind: ReferenceKind; count: number }
/** Bonus rows of an E2E fixture (collected for delete targets only). */
export type TestBonusRow = {
  id: string; orderId: string | null; actorUserId: string | null; type: string; points: number; balanceAfter: number; createdAt: string
}
export type TargetState = {
  target: CleanupTarget; user: TargetUser | null; references: ReferenceCount[]; neutralizedEarlier: boolean; bonusRows: TestBonusRow[]
}
export type Outcome = 'neutralize' | 'delete' | 'noop' | 'blocked' | 'abort'
export type Decision = { id: string; email: string; action: CleanupTarget['action']; outcome: Outcome; reasons: string[] }
export type CleanupPlan = { runId: string; decisions: Decision[]; fingerprint: string; refused: boolean; changes: number }

const listed = (refs: ReferenceCount[], kind: ReferenceKind): string[] =>
  refs.filter((ref) => ref.kind === kind && ref.count > 0).map((ref) => `${ref.table}.${ref.column}=${ref.count}`)

const FIXTURE_ID = /^u_e2e_[a-z]+_fixture$/

/**
 * A fixture's own bonus history is test data that may go with it only when every row is an
 * automatic order credit no longer linked to any order, nobody else acted on it, and the
 * balance is exactly what those rows produced. Anything else stays a business blocker.
 */
export function detachedTestBonus(user: TargetUser, rows: TestBonusRow[]): { ok: boolean; reason?: string } {
  if (rows.length === 0) return { ok: user.bonusPoints === 0, reason: user.bonusPoints === 0 ? undefined : `bonusPoints=${user.bonusPoints} without bonus rows` }
  const linked = rows.filter((row) => row.orderId != null || row.actorUserId != null || row.type !== 'order_earn')
  if (linked.length > 0) return { ok: false, reason: `bonus rows linked to orders/actors or not order_earn: ${linked.map((row) => row.id).join(',')}` }
  const latest = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).at(-1)!
  if (latest.balanceAfter !== user.bonusPoints) return { ok: false, reason: `bonusPoints=${user.bonusPoints} differs from the bonus history (${latest.balanceAfter})` }
  return { ok: true }
}

function decide(state: TargetState): Decision {
  const { target, user, references } = state
  const base = { id: target.id, email: target.email, action: target.action }
  if (!user) {
    return target.action === 'delete'
      ? { ...base, outcome: 'noop', reasons: ['already absent'] }
      : { ...base, outcome: 'abort', reasons: ['target user not found'] }
  }
  if (user.email.toLowerCase() !== target.email) return { ...base, outcome: 'abort', reasons: ['e-mail of this id differs from the reviewed target'] }
  if (isStaffSubject(user) || user.superAdmin) return { ...base, outcome: 'abort', reasons: ['target currently has admin-panel access or Super Admin'] }

  if (target.action === 'neutralize') {
    const reasons = [
      ...listed(references, 'credential'),
      ...(user.hasMfaSecret || user.mfaEnabled || user.mfaBackupCodeCount > 0 ? ['MFA secret or backup codes present'] : []),
      ...(state.neutralizedEarlier ? [] : ['password not yet replaced']),
    ]
    return reasons.length > 0 ? { ...base, outcome: 'neutralize', reasons } : { ...base, outcome: 'noop', reasons: ['already neutralized'] }
  }

  const bonus = detachedTestBonus(user, state.bonusRows)
  const ownBonusRows = (ref: ReferenceCount): boolean => bonus.ok && ref.table === 'BonusTransaction' && ref.column === 'userId'
  const blocked = [
    ...(FIXTURE_ID.test(user.id) && user.email.startsWith('e2e-') && user.email.endsWith('@hairshoppro.lv.local') && (user.name ?? '').startsWith('E2E ')
      ? [] : ['test origin not confirmed (id, e-mail and name must match the E2E fixture pattern)']),
    ...(bonus.ok ? [] : [bonus.reason!]),
    ...listed(references.filter((ref) => !ownBonusRows(ref)), 'business'),
  ]
  if (blocked.length > 0) return { ...base, outcome: 'blocked', reasons: blocked }
  const bonusNote = state.bonusRows.length > 0
    ? [`test bonus rows=${state.bonusRows.length} (${state.bonusRows.map((row) => row.points).join('+')} points, balance ${user.bonusPoints})`]
    : []
  return { ...base, outcome: 'delete', reasons: [...listed(references, 'credential'), ...listed(references, 'auxiliary'), ...bonusNote] }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/** The fingerprint covers decisions and the exact state they were made on: any change needs a new review. */
export function planTestAccountCleanup(states: TargetState[]): CleanupPlan {
  const decisions = states.map(decide)
  const fingerprint = createHash('sha256').update(canonical({ runId: CLEANUP_RUN_ID, decisions, states })).digest('hex').slice(0, 16)
  return {
    runId: CLEANUP_RUN_ID,
    decisions,
    fingerprint,
    refused: decisions.some((decision) => decision.outcome === 'abort'),
    changes: decisions.filter((decision) => decision.outcome === 'neutralize' || decision.outcome === 'delete').length,
  }
}

// ---------------------------------------------------------------------------------------------
// Database side. Identifiers come from USER_REFERENCES or pg_constraint and are validated.

type Tx = ExtendedTransactionClient
const IDENTIFIER = /^[A-Za-z0-9_]+$/
const quote = (identifier: string): string => {
  if (!IDENTIFIER.test(identifier)) throw new Error(`unexpected identifier ${identifier}`)
  return `"${identifier}"`
}

// Every query is a network round trip inside one transaction (Neon: ~100 ms each), so lookups
// are batched: one catalog read, one count query per target, one digest query.
async function existingTables(tx: Tx): Promise<Set<string>> {
  const rows = await tx.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  )
  return new Set(rows.map((row) => row.name))
}

/** Listed references plus any foreign key to "User" that the list does not know (counted as business). */
async function referenceList(tx: Tx): Promise<Reference[]> {
  const fks = await tx.$queryRawUnsafe<Array<{ tbl: string; col: string }>>(
    // ::text: the Neon driver adapter cannot deserialize the catalog's `name` type.
    `SELECT cl.relname::text AS tbl, a.attname::text AS col
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = to_regclass('public."User"')`,
  )
  const known = new Set(USER_REFERENCES.map((ref) => `${ref.table}.${ref.column}`))
  const unlisted = fks
    .filter((fk) => !known.has(`${fk.tbl}.${fk.col}`))
    .map((fk): Reference => ({ table: fk.tbl, column: fk.col, kind: 'business' }))
  return [...USER_REFERENCES, ...unlisted]
}

async function countReferences(tx: Tx, refs: Reference[], tables: Set<string>, user: { id: string; email: string }): Promise<ReferenceCount[]> {
  const present = refs.filter((ref) => tables.has(ref.table))
  if (present.length === 0) return []
  const sql = present.map((ref, index) => `SELECT ${index} AS i, count(*)::int AS n FROM ${quote(ref.table)} WHERE ${
    ref.byEmail ? `lower(${quote(ref.column)}) = lower($2)` : `${quote(ref.column)} = $1`}`).join(' UNION ALL ')
  const rows = await tx.$queryRawUnsafe<Array<{ i: number; n: number }>>(sql, user.id, user.email)
  return present.map((ref, index) => ({
    table: ref.table, column: ref.column, kind: ref.kind, count: Number(rows.find((row) => Number(row.i) === index)?.n ?? 0),
  }))
}

type UserRow = {
  id: string; email: string; name: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean
  bonusPoints: number; cardNumber: string | null; mustChangePassword: boolean; mfaEnabled: boolean
  mfaSecret: string | null; mfaBackupCodes: string[]; createdAt: Date; updatedAt: Date
}

export async function collectCleanupStates(tx: Tx, lock = false): Promise<TargetState[]> {
  const ids = CLEANUP_TARGETS.map((target) => target.id)
  const rows = await tx.$queryRawUnsafe<UserRow[]>(
    `SELECT id, email, name, "platformRole", "teamRole", "superAdmin", "bonusPoints", "cardNumber", "mustChangePassword",
            "mfaEnabled", "mfaSecret", "mfaBackupCodes", "createdAt", "updatedAt"
       FROM "User" WHERE id = ANY($1::text[]) ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    ids,
  )
  const refs = await referenceList(tx)
  const tables = await existingTables(tx)
  const bonusByUser = await tx.$queryRawUnsafe<Array<Omit<TestBonusRow, 'createdAt'> & { userId: string; createdAt: Date }>>(
    `SELECT id, "userId", "orderId", "actorUserId", type, points, "balanceAfter", "createdAt" FROM "BonusTransaction"
      WHERE "userId" = ANY($1::text[]) ORDER BY "createdAt", id`,
    CLEANUP_TARGETS.filter((target) => target.action === 'delete').map((target) => target.id),
  )
  const neutralized = new Set((await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT DISTINCT "entityId" AS id FROM "AuditLog" WHERE action = $1 AND "entityId" = ANY($2::text[])', NEUTRALIZED_ACTION, ids,
  )).map((row) => row.id))
  const states: TargetState[] = []
  for (const target of CLEANUP_TARGETS) {
    const row = rows.find((candidate) => candidate.id === target.id)
    const user: TargetUser | null = row ? {
      id: row.id, email: row.email, name: row.name, platformRole: row.platformRole, teamRole: row.teamRole,
      superAdmin: row.superAdmin, bonusPoints: row.bonusPoints, hasCard: row.cardNumber != null,
      mustChangePassword: row.mustChangePassword, mfaEnabled: row.mfaEnabled, hasMfaSecret: row.mfaSecret != null,
      mfaBackupCodeCount: row.mfaBackupCodes?.length ?? 0,
      createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
    } : null
    const references = user ? await countReferences(tx, refs, tables, user) : []
    const bonusRows: TestBonusRow[] = user && target.action === 'delete'
      ? bonusByUser.filter((row) => row.userId === user.id).map((row) => ({
          id: row.id, orderId: row.orderId, actorUserId: row.actorUserId, type: row.type,
          points: Number(row.points), balanceAfter: Number(row.balanceAfter), createdAt: new Date(row.createdAt).toISOString(),
        }))
      : []
    states.push({ target, user, references, neutralizedEarlier: neutralized.has(target.id), bonusRows })
  }
  return states
}

const SECRET_KEY = /secret|token|backupcodes|recovery.*hash/i
function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'passwordHash' && typeof value === 'string') {
      out[key] = `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
    } else if (SECRET_KEY.test(key) && value != null) {
      out[key] = Array.isArray(value) ? `[redacted ${value.length}]` : '[redacted]'
    } else {
      out[key] = value
    }
  }
  return out
}

/** Pre-change snapshot of every row the clean-up may touch, with credentials redacted. */
export async function snapshotCleanupRows(tx: Tx): Promise<Record<string, unknown[]>> {
  const ids = CLEANUP_TARGETS.map((target) => target.id)
  const snapshot: Record<string, unknown[]> = {}
  const users = await tx.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
    'SELECT to_jsonb(u) AS row FROM "User" u WHERE id = ANY($1::text[]) ORDER BY id', ids,
  )
  snapshot.User = users.map(({ row }) => redactRow(row))
  const tables = await existingTables(tx)
  for (const ref of USER_REFERENCES.filter((candidate) => candidate.kind === 'credential' || candidate.kind === 'auxiliary')) {
    if (!tables.has(ref.table)) continue
    const rows = await tx.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
      `SELECT to_jsonb(t) AS row FROM ${quote(ref.table)} t WHERE ${quote(ref.column)} = ANY($1::text[])`, ids,
    )
    if (rows.length > 0) snapshot[`${ref.table}.${ref.column}`] = rows.map(({ row }) => redactRow(row))
  }
  return snapshot
}

/** Deletes the rows counted inside this transaction (target rows are locked, so counts are current). */
async function deleteReferences(tx: Tx, state: TargetState, kinds: ReferenceKind[]): Promise<Record<string, number>> {
  const removed: Record<string, number> = {}
  const userId = state.target.id
  const listed = new Set(USER_REFERENCES.filter((ref) => kinds.includes(ref.kind) && !ref.byEmail).map((ref) => `${ref.table}.${ref.column}`))
  for (const ref of state.references.filter((candidate) => candidate.count > 0 && listed.has(`${candidate.table}.${candidate.column}`))) {
    const n = await tx.$executeRawUnsafe(`DELETE FROM ${quote(ref.table)} WHERE ${quote(ref.column)} = $1`, userId)
    if (n !== ref.count) throw new Error(`expected to delete ${ref.count} rows from ${ref.table}.${ref.column} of ${userId}, deleted ${n}`)
    removed[`${ref.table}.${ref.column}`] = n
  }
  return removed
}

export type AppliedChange = { id: string; email: string; outcome: Outcome; removed: Record<string, number> }

/**
 * Everything the clean-up must leave untouched, hashed inside the apply transaction before and
 * after the changes: any difference throws, so the whole transaction rolls back.
 */
async function invariantDigests(
  tx: Tx, tables: Set<string>, excluded: { userIds: string[]; bonusIds: string[]; auditUpTo: string },
): Promise<Record<string, string>> {
  const parts: Array<[string, string, string]> = [
    ['orders', 'Order', 'true'],
    ['invoices', 'Invoice', 'true'],
    ['returns', 'ReturnRequest', 'true'],
    ['stockAllocations', 'StockAllocation', 'true'],
    ['promoRedemptions', 'PromoCodeRedemption', 'true'],
    ['otherBonusRows', 'BonusTransaction', 'NOT (t.id = ANY($1::text[]))'],
    ['otherUsers', 'User', 'NOT (t.id = ANY($2::text[]))'],
    ['earlierAudit', 'AuditLog', 't.sequence <= $3::bigint'],
  ]
  const present = parts.filter(([, table]) => tables.has(table))
  const sql = present.map(([label, table, where]) =>
    `SELECT '${label}' AS label, count(*)::int AS n, md5(string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text)) AS h FROM ${quote(table)} t WHERE ${where}`,
  ).join(' UNION ALL ')
  const rows = await tx.$queryRawUnsafe<Array<{ label: string; n: number; h: string | null }>>(sql, excluded.bonusIds, excluded.userIds, excluded.auditUpTo)
  return Object.fromEntries(parts.map(([label]) => {
    const row = rows.find((candidate) => candidate.label === label)
    return [label, row ? `${row.n}:${row.h ?? '-'}` : 'missing']
  }))
}

/**
 * Applies a reviewed plan inside the caller's transaction. Target rows are locked and the plan is
 * recomputed; it must match the reviewed fingerprint exactly, otherwise nothing is changed.
 */
export async function applyTestAccountCleanup(
  tx: Tx,
  input: { confirmFingerprint: string; operator: ServerUser; reason: string },
): Promise<{ plan: CleanupPlan; applied: AppliedChange[] }> {
  if (!input.reason.trim()) throw new Error('a reason is required')
  const states = await collectCleanupStates(tx, true)
  const plan = planTestAccountCleanup(states)
  if (plan.refused) throw new Error('plan is refused (abort outcome); nothing changed')
  if (plan.fingerprint !== input.confirmFingerprint) {
    throw new Error(`state changed since review: plan ${plan.fingerprint} does not match --confirm; nothing changed`)
  }

  const touchedUsers = plan.decisions.filter((d) => d.outcome === 'neutralize' || d.outcome === 'delete').map((d) => d.id)
  const tables = await existingTables(tx)
  const deletedBonusIds = plan.decisions
    .filter((d) => d.outcome === 'delete')
    .flatMap((d) => states.find((state) => state.target.id === d.id)?.bonusRows.map((row) => row.id) ?? [])
  const auditUpTo = (await tx.$queryRawUnsafe<Array<{ s: string | null }>>('SELECT coalesce(max(sequence), 0)::text AS s FROM "AuditLog"'))[0]?.s ?? '0'
  const invariantsBefore = await invariantDigests(tx, tables, { userIds: touchedUsers, bonusIds: deletedBonusIds, auditUpTo })

  const request = new NextRequest('http://maintenance.invalid/cleanup-test-accounts', {
    headers: { 'user-agent': 'scripts/cleanup-test-accounts.ts', 'x-request-id': `${CLEANUP_RUN_ID}-${plan.fingerprint}` },
  })
  const applied: AppliedChange[] = []
  for (const decision of plan.decisions) {
    if (decision.outcome === 'neutralize') {
      const unknownPassword = await bcrypt.hash(randomBytes(32).toString('base64url'), 12)
      await tx.user.update({
        where: { id: decision.id },
        data: { passwordHash: unknownPassword, mfaSecret: null, mfaEnabled: false, mfaBackupCodes: [], mfaEnrolledAt: null },
      })
      const removed = await deleteReferences(tx, states.find((state) => state.target.id === decision.id)!, ['credential'])
      await appendServerAudit(tx, request, input.operator, {
        action: NEUTRALIZED_ACTION, entityType: 'user', entityId: decision.id, entityTitle: decision.email,
        before: { reasons: decision.reasons }, after: { passwordReplaced: true, mfaRemoved: true, removed },
        details: `run=${CLEANUP_RUN_ID}; plan=${plan.fingerprint}`, reason: input.reason,
      })
      applied.push({ id: decision.id, email: decision.email, outcome: decision.outcome, removed })
    } else if (decision.outcome === 'delete') {
      const removed = await deleteReferences(tx, states.find((state) => state.target.id === decision.id)!, ['credential', 'auxiliary'])
      const bonusRows = states.find((state) => state.target.id === decision.id)?.bonusRows ?? []
      if (bonusRows.length > 0) {
        // Exactly the reviewed rows, and only while they are still detached test credits.
        const n = await tx.$executeRawUnsafe(
          `DELETE FROM "BonusTransaction" WHERE id = ANY($1::text[]) AND "userId" = $2 AND "orderId" IS NULL AND "actorUserId" IS NULL`,
          bonusRows.map((row) => row.id), decision.id,
        )
        if (n !== bonusRows.length) throw new Error(`expected to delete ${bonusRows.length} test bonus rows of ${decision.id}, deleted ${n}`)
        removed['BonusTransaction.userId'] = n
      }
      const bonusPoints = states.find((state) => state.target.id === decision.id)?.user?.bonusPoints ?? 0
      const deleted = await tx.$executeRawUnsafe('DELETE FROM "User" WHERE id = $1', decision.id)
      if (deleted !== 1) throw new Error(`expected to delete exactly one user ${decision.id}`)
      await appendServerAudit(tx, request, input.operator, {
        action: DELETED_ACTION, entityType: 'user', entityId: decision.id, entityTitle: decision.email,
        before: { removedWithUser: removed, bonusPoints, bonusRows: bonusRows.map((row) => ({ id: row.id, points: row.points, balanceAfter: row.balanceAfter })) },
        after: null,
        details: `run=${CLEANUP_RUN_ID}; plan=${plan.fingerprint}`, reason: input.reason,
      })
      applied.push({ id: decision.id, email: decision.email, outcome: decision.outcome, removed })
    } else {
      applied.push({ id: decision.id, email: decision.email, outcome: decision.outcome, removed: {} })
    }
  }

  const invariantsAfter = await invariantDigests(tx, tables, { userIds: touchedUsers, bonusIds: deletedBonusIds, auditUpTo })
  const changed = Object.keys(invariantsBefore).filter((key) => invariantsBefore[key] !== invariantsAfter[key])
  if (changed.length > 0) throw new Error(`invariant violated (${changed.join(', ')}); transaction rolled back`)
  return { plan, applied }
}

/** The person running the clean-up: an existing Super Admin with MFA, recorded as the audit actor. */
export async function resolveCleanupOperator(tx: Tx, email: string): Promise<ServerUser> {
  const user = await tx.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } } })
  if (!user || user.platformRole !== 'admin' || !user.superAdmin || !user.mfaEnabled) {
    throw new Error('operator must be an existing platform admin with Super Admin and MFA')
  }
  if (CLEANUP_TARGETS.some((target) => target.id === user.id)) throw new Error('operator cannot be a clean-up target')
  const { mapDbToServerUser } = await import('@/lib/server-auth')
  return mapDbToServerUser(user)
}
