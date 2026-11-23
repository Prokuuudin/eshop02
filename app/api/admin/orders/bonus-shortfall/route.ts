import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { ORDER_BONUS_SHORTFALL, reconcileOrderBonus } from '@/lib/order-bonus'

const inputSchema = z.object({ orderId: z.string().trim().min(1).max(100) }).strict()

// POST /api/admin/orders/bonus-shortfall — retries an all-or-nothing bonus debit that did not
// fit the customer's balance (open bonus_shortfall exception). Applies the whole missing
// amount or nothing; never partial, never a negative balance. The exception closes itself
// once nothing is missing. Writing a shortfall off is intentionally not available yet.
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const admin = await requireAdminPermission('orders.update')
  if (admin instanceof NextResponse) return admin

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { orderId } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, firstName: true, lastName: true } })
      if (!order) return { error: 'order_not_found' as const }
      const exception = await tx.orderOperationalException.findUnique({
        where: { orderId_code: { orderId, code: ORDER_BONUS_SHORTFALL } },
        select: { status: true },
      })
      if (exception?.status !== 'open') return { error: 'no_open_exception' as const }

      const bonus = await reconcileOrderBonus(tx, orderId, { trigger: 'shortfall_retry', actorUserId: admin.id })
      await appendServerAudit(tx, req, admin, {
        action: 'order.bonus_shortfall_retried',
        entityType: 'order',
        entityId: orderId,
        entityTitle: `${order.firstName} ${order.lastName}`.trim(),
        before: { exception: 'open' },
        after: {
          exception: bonus.shortfallPoints > 0 ? 'open' : 'resolved',
          applied: bonus.applied,
          shortfallPoints: bonus.shortfallPoints,
        },
      })
      return { ok: true as const, shortfallPoints: bonus.shortfallPoints, applied: bonus.applied }
    }, { timeout: 20_000 })

    if ('error' in result) {
      return NextResponse.json(result, { status: result.error === 'order_not_found' ? 404 : 409 })
    }
    return NextResponse.json(result)
  } catch (error) {
    logApiError('[admin/orders/bonus-shortfall]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
