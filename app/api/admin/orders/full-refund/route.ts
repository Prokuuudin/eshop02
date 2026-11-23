import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { lockOrderBonusUser, reconcileOrderBonus } from '@/lib/order-bonus'

const inputSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  // The action records a refund that already happened outside Hairshop Pro (Paysera
  // dashboard, bank transfer, cash). It never moves money, so staff must confirm it.
  confirmMoneyReturned: z.literal(true),
  reason: z.string().trim().min(10).max(1000),
}).strict()

// POST /api/admin/orders/full-refund — records a confirmed FULL refund of a paid order:
// paymentStatus paid → refunded (terminal), earned points revoked and spent points returned
// through the bonus ledger in the same transaction. A revoke the balance cannot cover is
// not applied partially: it opens a bonus_shortfall exception. Partial refunds are not
// supported. Admin-only (orders.refund), reason required, audited.
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const admin = await requireAdminPermission('orders.refund')
  if (admin instanceof NextResponse) return admin

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { orderId, reason } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, firstName: true, lastName: true, paymentStatus: true, paymentProvider: true, total: true },
      })
      if (!order) return { error: 'order_not_found' as const }
      if (order.paymentStatus === 'refunded') return { error: 'already_refunded' as const }
      if (order.paymentStatus !== 'paid') return { error: 'order_not_paid' as const }

      await lockOrderBonusUser(tx, order.userId)
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } })
      const bonus = await reconcileOrderBonus(tx, orderId, { trigger: 'full_refund', actorUserId: admin.id })
      await appendServerAudit(tx, req, admin, {
        action: 'order.payment_refunded',
        entityType: 'order',
        entityId: orderId,
        entityTitle: `${order.firstName} ${order.lastName}`.trim(),
        before: { paymentStatus: 'paid', paymentProvider: order.paymentProvider },
        after: {
          paymentStatus: 'refunded',
          refund: 'full',
          moneyReturnedOutsideApp: true,
          bonus: { ...bonus.applied, shortfallPoints: bonus.shortfallPoints },
        },
        reason,
      })
      return { ok: true as const, bonus }
    }, { timeout: 20_000 })

    if ('error' in result) {
      return NextResponse.json(result, { status: result.error === 'order_not_found' ? 404 : 409 })
    }
    return NextResponse.json({
      ok: true,
      paymentStatus: 'refunded',
      bonus: { ...result.bonus.applied, shortfallPoints: result.bonus.shortfallPoints },
    })
  } catch (error) {
    logApiError('[admin/orders/full-refund]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
