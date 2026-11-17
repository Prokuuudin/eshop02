import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { appendServerAudit } from '@/lib/server-audit'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import {
  getRevokedCardPolicy,
  isRevokedCardPolicyError,
  restoreCardInRegistry,
  revokeCardInRegistry,
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

function policyErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof RouteError) return NextResponse.json({ error: e.code }, { status: e.status })
  if (isRevokedCardPolicyError(e, 'registry_inactive')) return NextResponse.json({ error: 'registry_inactive' }, { status: 409 })
  if (isRevokedCardPolicyError(e, 'card_protected')) return NextResponse.json({ error: 'card_protected' }, { status: 409 })
  if (isRevokedCardPolicyError(e, 'not_restorable')) return NextResponse.json({ error: 'not_restorable' }, { status: 409 })
  if (isRevokedCardPolicyError(e)) return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
  return null
}

/** Cards revoked from the admin panel (newest first) and the size of the 2026-11-16 batch. */
export async function GET(): Promise<Response> {
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  try {
    const policy = await getRevokedCardPolicy()
    const adminEntries = [...policy.cards.entries()].filter(([, entry]) => entry.origin === 'admin')
    const userIds = [...new Set(adminEntries.flatMap(([, entry]) => [entry.userId, entry.revokedBy ?? '']).filter(Boolean))]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, cardNumber: true } })
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))
    const cards = adminEntries
      .map(([cardNumber, entry]) => {
        const holder = usersById.get(entry.userId)
        return {
          cardNumber,
          userId: entry.userId,
          customerName: holder?.name ?? null,
          customerEmail: holder?.email ?? null,
          // A customer who has since received another card cannot get this one back.
          restorable: Boolean(holder && normalizeCardNumber(holder.cardNumber ?? '') === cardNumber),
          revokedAt: entry.revokedAt ?? null,
          revokedByName: entry.revokedBy ? (usersById.get(entry.revokedBy)?.name ?? usersById.get(entry.revokedBy)?.email ?? null) : null,
          reason: entry.reason ?? null,
        }
      })
      .sort((a, b) => (b.revokedAt ?? '').localeCompare(a.revokedAt ?? ''))
    return NextResponse.json({ cards, batchCount: policy.cards.size - adminEntries.length })
  } catch (e) {
    const known = policyErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Revoke a customer's current card: no card login, hidden from card lists, never reissued. */
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
      const [holder] = await tx.$queryRaw<Array<{ cardNumber: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean }>>`
        SELECT "cardNumber", "platformRole", "teamRole", "superAdmin" FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!holder) throw new RouteError('not_found', 404)
      if (normalizeCardNumber(holder.cardNumber ?? '') !== cardNumber) throw new RouteError('card_changed', 409)
      if (isProtectedStaffAccount(holder)) throw new RouteError('staff_account', 409)
      const added = await revokeCardInRegistry(tx, { cardNumber, userId, revokedBy: caller.id, reason })
      if (!added) throw new RouteError('already_revoked', 409)
      // A revoked card may be lost or stolen: end every session it could have opened.
      const sessions = await tx.session.deleteMany({ where: { userId } })
      await appendServerAudit(tx, req, caller, {
        action: 'card.revoked', entityType: 'user', entityId: userId,
        before: { cardRevoked: false }, after: { cardRevoked: true },
        details: `sessionsRevoked=${sessions.count}`,
        reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const known = policyErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Undo an admin revocation while the customer still holds that card. */
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
    const known = (await getRevokedCardPolicy()).cards.get(cardNumber)
    if (!known || known.origin !== 'admin') return NextResponse.json({ error: 'not_restorable' }, { status: 409 })
    await prisma.$transaction(async (tx) => {
      // Lock order everywhere is customer row first, then the registry row.
      const [holder] = await tx.$queryRaw<Array<{ cardNumber: string | null }>>`
        SELECT "cardNumber" FROM "User" WHERE id = ${known.userId} FOR UPDATE`
      const entry = await restoreCardInRegistry(tx, cardNumber)
      if (entry.userId !== known.userId) throw new RouteError('concurrent_update', 409)
      if (!holder || normalizeCardNumber(holder.cardNumber ?? '') !== cardNumber) throw new RouteError('card_reassigned', 409)
      await appendServerAudit(tx, req, caller, {
        action: 'card.restored', entityType: 'user', entityId: entry.userId,
        before: { cardRevoked: true }, after: { cardRevoked: false },
        reason: parsed.data.reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const known = policyErrorResponse(e)
    if (known) return known
    logApiError('[admin/revoked-cards DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
