import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

const statusSchema = z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
type Status = z.infer<typeof statusSchema>
const transitions: Record<Status, Status[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

const schema = z.object({
  orderIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
  status: statusSchema,
})

export async function POST(req: NextRequest): Promise<Response> {
  const admin = await requireAdminPermission('orders.update')
  if (admin instanceof NextResponse) return admin
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_bulk_status' }, { status: 400 })

  const orderIds = [...new Set(parsed.data.orderIds)]
  try {
    await prisma.$transaction(async (tx) => {
      // Stable ordering prevents two overlapping bulk operations from deadlocking.
      for (const orderId of [...orderIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      }
      const [orders, statusRows] = await Promise.all([
        tx.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, firstName: true, lastName: true, items: true, paymentStatus: true, stockReservationStatus: true },
        }),
        tx.orderStatusRecord.findMany({ where: { orderId: { in: orderIds } } }),
      ])
      if (orders.length !== orderIds.length) throw new Error('order_not_found')
      const currentById = new Map(statusRows.map((row) => [row.orderId, row.status]))
      for (const order of orders) {
        const currentRaw = currentById.get(order.id) ?? 'pending'
        const currentParsed = statusSchema.safeParse(currentRaw)
        if (!currentParsed.success) throw new Error('invalid_current_status')
        const current = currentParsed.data
        if (current !== parsed.data.status && !transitions[current].includes(parsed.data.status)) {
          throw new Error(`invalid_transition:${order.id}:${current}`)
        }
        if (parsed.data.status === 'cancelled' && order.paymentStatus === 'paid') {
          throw new Error(`paid_order_requires_refund:${order.id}`)
        }
      }
      for (const order of orders) {
        const current = statusSchema.parse(currentById.get(order.id) ?? 'pending')
        if (current === parsed.data.status) continue
        if (parsed.data.status === 'cancelled' && order.stockReservationStatus !== 'released') {
          for (const item of order.items as Array<{ id?: string; quantity?: number }>) {
            if (item.id && Number.isInteger(item.quantity) && Number(item.quantity) > 0) {
              await tx.product.updateMany({
                where: { id: item.id, isDeleted: false },
                data: { stock: { increment: Number(item.quantity) } },
              })
            }
          }
          await tx.order.update({
            where: { id: order.id },
            data: { stockReservationStatus: 'released', stockReleasedAt: new Date(), stockReservedUntil: null },
          })
        }
        await tx.orderStatusRecord.upsert({
          where: { orderId: order.id },
          create: { orderId: order.id, status: parsed.data.status },
          update: { status: parsed.data.status },
        })
        await appendServerAudit(tx, req, admin, {
            action: 'order.status_changed', entityType: 'order', entityId: order.id,
            entityTitle: `${order.firstName} ${order.lastName}`.trim(),
            before: { status: current }, after: { status: parsed.data.status },
            details: `Bulk status update (${orderIds.length} orders)`,
        })
      }
    })
    return NextResponse.json({ ok: true, updated: orderIds.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bulk_status_failed'
    const status = message === 'order_not_found'
      ? 404
      : message.startsWith('invalid_') || message.startsWith('paid_order_requires_refund:')
        ? 409
        : 500
    if (status === 500) logApiError("[admin/order-meta/bulk]", error)
    return NextResponse.json({ error: message }, { status })
  }
}

