import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { resolveLatePaymentByReholdingStock } from '@/lib/order-operational-exceptions'

const inputSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(10).max(1000),
}).strict()

// POST /api/admin/orders/late-payment-exception — closes an open
// late_payment_stock_unavailable exception once the stock is back. The order is re-held as
// committed through the Stock Ledger in the same transaction; if any line is still short,
// nothing changes. Admin-only (orders.refund), reason required, audited with actor and time.
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`
      const outcome = await resolveLatePaymentByReholdingStock(tx, orderId, admin.id)
      if (!outcome.resolved) return outcome
      await appendServerAudit(tx, req, admin, {
        action: 'order.late_payment_exception_resolved',
        entityType: 'order',
        entityId: orderId,
        entityTitle: `${outcome.order.firstName} ${outcome.order.lastName}`.trim(),
        before: { exception: 'open', stockReservationStatus: 'released' },
        after: {
          exception: 'resolved',
          exceptionId: outcome.exceptionId,
          resolution: 'stock_reheld',
          stockReservationStatus: 'committed',
          resolvedBy: admin.id,
          resolvedAt: outcome.resolvedAt.toISOString(),
          items: outcome.order.items.map((item) => ({ id: item.id, quantity: item.quantity })),
        },
        reason,
      })
      return outcome
    }, { timeout: 20_000 })

    if (!result.resolved) {
      return NextResponse.json(result, { status: result.error === 'order_not_found' ? 404 : 409 })
    }
    return NextResponse.json({ ok: true, resolution: 'stock_reheld', resolvedAt: result.resolvedAt.toISOString() })
  } catch (error) {
    logApiError('[admin/orders/late-payment-exception]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
