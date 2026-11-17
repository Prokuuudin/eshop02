import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { appendServerAudit } from '@/lib/server-audit'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import { revokeCustomerCard } from '@/lib/admin-card-revocation'
import {
  getAdminCardRevocations,
  getRevokedCardPolicy,
  isRevokedCardPolicyError,
  removeAdminCardRevocation,
  REVOKE_REASON_MAX_LENGTH,
} from '@/lib/revoked-card-policy'

export const runtime = 'nodejs'

const reasonSchema = z.string().trim().min(3).max(REVOKE_REASON_MAX_LENGTH)
const revokeSchema = z.object({ userId: z.string().min(1).max(200), cardNumber: z.string().trim().min(1).max(100), reason: reasonSchema })
const restoreSchema = z.object({ cardNumber: z.string().trim().min(1).max(100), reason: reasonSchema })

class RouteError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
  }
}

function knownErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof RouteError) return NextResponse.json({ error: e.code }, { status: e.status })
  if (isRevokedCardPolicyError(e, 'card_protected')) return NextResponse.json({ error: 'card_protected' }, { status: 409 })
  if (isRevokedCardPolicyError(e, 'not_restorable')) return NextResponse.json({ error: 'not_restorable' }, { status: 409 })
  if (isRevokedCardPolicyError(e)) return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
  if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') return NextResponse.json({ error: 'card_taken' }, { status: 409 })
  return null
}

type HolderRow = { cardNumber: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean }

/** Cards revoked from the admin panel (newest first) and the size of the 2026-11-16 batch. */
export async function GET(): Promise<Response> {
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  try {
    const [batch, adminRevoked] = await Promise.all([getRevokedCardPolicy(), getAdminCardRevocations()])
    const entries = [...adminRevoked.entries()]
    const userIds = [...new Set(entries.flatMap(([, entry]) => [entry.userId, entry.revokedBy]))]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, cardNumber: true } })
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))
    const cards = entries
      .map(([cardNumber, entry]) => {
        const customer = usersById.get(entry.userId)
        const admin = usersById.get(entry.revokedBy)
        return {
          cardNumber,
          userId: entry.userId,
          customerName: customer?.name ?? null,
          customerEmail: customer?.email ?? null,
          // A customer who has since received another card cannot get this one back.
          restorable: Boolean(customer && !customer.cardNumber),
          revokedAt: entry.revokedAt,
          revokedByName: admin?.name ?? admin?.email ?? null,
          reason: entry.reason,
        }
      })
      .sort((a, b) => b.revokedAt.localeCompare(a.revokedAt))
    return NextResponse.json({ cards, batchCount: batch.cards.size })
  } catch (e) {
    const known = knownErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Revoke a customer's current card. See lib/admin-card-revocation for what that changes. */
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller

  const parsed = revokeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const cardNumber = normalizeCardNumber(parsed.data.cardNumber)
  if (!isValidCardNumber(cardNumber)) return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
  const { userId, reason } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const [holder] = await tx.$queryRaw<HolderRow[]>`
        SELECT "cardNumber", "platformRole", "teamRole", "superAdmin" FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!holder) throw new RouteError('not_found', 404)
      if (normalizeCardNumber(holder.cardNumber ?? '') !== cardNumber) throw new RouteError('card_changed', 409)
      if (isProtectedStaffAccount(holder)) throw new RouteError('staff_account', 409)
      const result = await revokeCustomerCard(tx, { userId, cardNumber, revokedBy: caller.id, reason })
      if (!result.recorded) throw new RouteError('already_revoked', 409)
      await appendServerAudit(tx, req, caller, {
        action: 'card.revoked', entityType: 'user', entityId: userId,
        before: { hasCard: true }, after: { hasCard: false, cardRevoked: true },
        details: `sessionsRevoked=${result.sessionsRevoked}; invitationsRevoked=${result.invitationsRevoked}`,
        reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const known = knownErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Undo an admin revocation: the card goes back to its customer if they have no card since. */
export async function DELETE(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller

  const parsed = restoreSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const cardNumber = normalizeCardNumber(parsed.data.cardNumber)
  if (!isValidCardNumber(cardNumber)) return NextResponse.json({ error: 'invalid_card' }, { status: 400 })

  try {
    const known = (await getAdminCardRevocations()).get(cardNumber)
    if (!known) return NextResponse.json({ error: 'not_restorable' }, { status: 409 })
    await prisma.$transaction(async (tx) => {
      // Lock order everywhere: customer row first, then the admin revocation registry.
      const [holder] = await tx.$queryRaw<HolderRow[]>`
        SELECT "cardNumber", "platformRole", "teamRole", "superAdmin" FROM "User" WHERE id = ${known.userId} FOR UPDATE`
      if (!holder) throw new RouteError('not_found', 404)
      if (holder.cardNumber) throw new RouteError('card_reassigned', 409)
      if (isProtectedStaffAccount(holder)) throw new RouteError('staff_account', 409)
      const entry = await removeAdminCardRevocation(tx, cardNumber)
      if (entry.userId !== known.userId) throw new RouteError('concurrent_update', 409)
      // The unique index refuses the number if someone else holds it (P2002 → card_taken).
      await tx.user.update({ where: { id: known.userId }, data: { cardNumber } })
      await appendServerAudit(tx, req, caller, {
        action: 'card.restored', entityType: 'user', entityId: known.userId,
        before: { hasCard: false, cardRevoked: true }, after: { hasCard: true, cardRevoked: false },
        reason: parsed.data.reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const known = knownErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
