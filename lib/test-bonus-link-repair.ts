import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

/**
 * One-off repair (scripts/repair-test-bonus-order-links.ts). Two bonus rows of the E2E customer
 * fixture still name order ids 1019/1020: their test orders were deleted outside the admin
 * delete route (which unlinks bonus rows), and order ids are max+1, so later real orders of other
 * customers received the same ids. Only `orderId` of these exact rows is cleared: points,
 * balances, reasons and every real customer's rows stay untouched.
 */
export const REPAIR_RUN_ID = 'test-bonus-order-links-2026-11-12'
export const REPAIR_ACTION = 'bonus.test_order_link_cleared'
const FIXTURE_USER_ID = 'u_e2e_customer_fixture'

export const STALE_LINK_TARGETS: ReadonlyArray<{ id: string; userId: string; orderId: string }> = [
  { id: 'cmsofak7f0000cgw43x9miw66', userId: FIXTURE_USER_ID, orderId: '1019' },
  { id: 'cmsofaz2y0001cgw42rmhzzvs', userId: FIXTURE_USER_ID, orderId: '1020' },
]

export type LinkRow = {
  id: string; userId: string; orderId: string | null; type: string; points: number; createdAt: string
  orderUserId: string | null; orderCreatedAt: string | null; orderExists: boolean
}
export type LinkDecision = { id: string; outcome: 'clear' | 'noop' | 'abort'; reasons: string[] }
export type LinkPlan = { runId: string; decisions: LinkDecision[]; otherStaleRows: string[]; fingerprint: string; refused: boolean; changes: number }

/** Stale: the row's order is gone, belongs to another user, or was created after the bonus row. */
export function isStaleOrderLink(row: LinkRow): boolean {
  if (row.orderId == null) return false
  if (!row.orderExists) return true
  if (row.orderUserId !== row.userId) return true
  return row.orderCreatedAt != null && Date.parse(row.createdAt) < Date.parse(row.orderCreatedAt) - 60_000
}

function decide(target: (typeof STALE_LINK_TARGETS)[number], row: LinkRow | undefined): LinkDecision {
  if (!row) return { id: target.id, outcome: 'abort', reasons: ['bonus row not found'] }
  if (row.userId !== target.userId) return { id: target.id, outcome: 'abort', reasons: ['bonus row belongs to another user'] }
  if (row.orderId == null) return { id: target.id, outcome: 'noop', reasons: ['order link already cleared'] }
  if (row.orderId !== target.orderId) return { id: target.id, outcome: 'abort', reasons: [`order link is ${row.orderId}, reviewed ${target.orderId}`] }
  if (!isStaleOrderLink(row)) return { id: target.id, outcome: 'abort', reasons: ['link is not stale (order belongs to this user)'] }
  return {
    id: target.id,
    outcome: 'clear',
    reasons: [row.orderExists ? `order ${row.orderId} now belongs to another account and was created later` : `order ${row.orderId} no longer exists`],
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

export function planBonusLinkRepair(rows: LinkRow[], allStale: LinkRow[]): LinkPlan {
  const decisions = STALE_LINK_TARGETS.map((target) => decide(target, rows.find((row) => row.id === target.id)))
  const targetIds = new Set(STALE_LINK_TARGETS.map((target) => target.id))
  // Reported for a separate decision; never changed by this run.
  const otherStaleRows = allStale.filter((row) => !targetIds.has(row.id)).map((row) => `${row.id} user=${row.userId} order=${row.orderId}`)
  const fingerprint = createHash('sha256').update(canonical({ runId: REPAIR_RUN_ID, decisions, rows, otherStaleRows })).digest('hex').slice(0, 16)
  return {
    runId: REPAIR_RUN_ID, decisions, otherStaleRows, fingerprint,
    refused: decisions.some((decision) => decision.outcome === 'abort'),
    changes: decisions.filter((decision) => decision.outcome === 'clear').length,
  }
}

type Tx = ExtendedTransactionClient
const ROW_SQL = `
  SELECT b.id, b."userId", b."orderId", b.type, b.points, b."createdAt",
         o."userId" AS "orderUserId", o."createdAt" AS "orderCreatedAt", (o.id IS NOT NULL) AS "orderExists"
    FROM "BonusTransaction" b LEFT JOIN "Order" o ON o.id = b."orderId"`

type RawRow = Omit<LinkRow, 'createdAt' | 'orderCreatedAt'> & { createdAt: Date; orderCreatedAt: Date | null }
const normalize = (row: RawRow): LinkRow => ({
  ...row,
  points: Number(row.points),
  createdAt: new Date(row.createdAt).toISOString(),
  orderCreatedAt: row.orderCreatedAt ? new Date(row.orderCreatedAt).toISOString() : null,
})

export async function collectBonusLinkState(tx: Tx, lock = false): Promise<{ rows: LinkRow[]; allStale: LinkRow[] }> {
  const ids = STALE_LINK_TARGETS.map((target) => target.id)
  const rows = (await tx.$queryRawUnsafe<RawRow[]>(`${ROW_SQL} WHERE b.id = ANY($1::text[]) ORDER BY b.id${lock ? ' FOR UPDATE OF b' : ''}`, ids)).map(normalize)
  const linked = (await tx.$queryRawUnsafe<RawRow[]>(`${ROW_SQL} WHERE b."orderId" IS NOT NULL ORDER BY b.id`)).map(normalize)
  return { rows, allStale: linked.filter(isStaleOrderLink) }
}

export async function applyBonusLinkRepair(
  tx: Tx,
  input: { confirmFingerprint: string; operator: ServerUser; reason: string },
): Promise<{ plan: LinkPlan; cleared: string[] }> {
  if (!input.reason.trim()) throw new Error('a reason is required')
  const state = await collectBonusLinkState(tx, true)
  const plan = planBonusLinkRepair(state.rows, state.allStale)
  if (plan.refused) throw new Error('plan is refused (abort outcome); nothing changed')
  if (plan.fingerprint !== input.confirmFingerprint) {
    throw new Error(`state changed since review: plan ${plan.fingerprint} does not match --confirm; nothing changed`)
  }
  const request = new NextRequest('http://maintenance.invalid/repair-test-bonus-order-links', {
    headers: { 'user-agent': 'scripts/repair-test-bonus-order-links.ts', 'x-request-id': `${REPAIR_RUN_ID}-${plan.fingerprint}` },
  })
  const cleared: string[] = []
  for (const decision of plan.decisions.filter((candidate) => candidate.outcome === 'clear')) {
    const row = state.rows.find((candidate) => candidate.id === decision.id)!
    const updated = await tx.$executeRawUnsafe(
      'UPDATE "BonusTransaction" SET "orderId" = NULL WHERE id = $1 AND "userId" = $2 AND "orderId" = $3',
      row.id, row.userId, row.orderId,
    )
    if (updated !== 1) throw new Error(`expected to update exactly one bonus row ${row.id}`)
    await appendServerAudit(tx, request, input.operator, {
      action: REPAIR_ACTION, entityType: 'bonus_transaction', entityId: row.id, entityTitle: row.userId,
      before: { orderId: row.orderId, points: row.points, type: row.type }, after: { orderId: null, points: row.points, type: row.type },
      details: `run=${REPAIR_RUN_ID}; plan=${plan.fingerprint}; ${decision.reasons.join('; ')}`, reason: input.reason,
    })
    cleared.push(row.id)
  }
  return { plan, cleared }
}
