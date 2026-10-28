import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'
import { acknowledgeCommittedAllocations } from '@/lib/stock-ledger'
import { stockLedgerFlags } from '@/lib/stock-ledger-config'

const inputSchema = z.object({ orderId: z.string().trim().min(1).max(100) })

export async function GET(req: NextRequest): Promise<Response> {
  const admin = await requireAdminPermission('orders.read')
  if (admin instanceof NextResponse) return admin
  if (!stockLedgerFlags().ledgerEnabled) return NextResponse.json({ enabled: false })

  const parsed = inputSchema.safeParse({ orderId: req.nextUrl.searchParams.get('orderId') })
  if (!parsed.success) return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 })
  const rows = await prisma.stockAllocation.findMany({
    where: { orderId: parsed.data.orderId, status: { in: ['committed', 'awaiting_grins_sync'] } },
    select: { status: true, quantity: true, acknowledgedAt: true },
  })
  return NextResponse.json({
    enabled: true,
    committed: rows.filter((row) => row.status === 'committed').reduce((sum, row) => sum + row.quantity, 0),
    awaiting: rows.filter((row) => row.status === 'awaiting_grins_sync').reduce((sum, row) => sum + row.quantity, 0),
    acknowledgedAt: rows.find((row) => row.acknowledgedAt)?.acknowledgedAt?.toISOString() ?? null,
  })
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const admin = await requireAdminPermission('orders.update')
    if (admin instanceof NextResponse) return admin
    if (!stockLedgerFlags().ledgerEnabled) return NextResponse.json({ error: 'stock_ledger_disabled' }, { status: 409 })

    const parsed = inputSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 })
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${parsed.data.orderId}`}))`
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${parsed.data.orderId} FOR UPDATE`
      const order = await tx.order.findUnique({
        where: { id: parsed.data.orderId },
        select: { id: true, firstName: true, lastName: true, stockReservationStatus: true },
      })
      if (!order) return { error: 'order_not_found' as const }
      if (order.stockReservationStatus !== 'committed') return { error: 'order_stock_not_committed' as const }

      const acknowledgment = await acknowledgeCommittedAllocations(tx, order.id, admin.id)
      if (acknowledgment.allocations === 0) return { error: 'no_committed_allocations' as const }
      if (!acknowledgment.idempotent) {
        await appendServerAudit(tx, req, admin, {
          action: 'order.grins_stock_acknowledged',
          entityType: 'order',
          entityId: order.id,
          entityTitle: `${order.firstName} ${order.lastName}`.trim(),
          after: { allocations: acknowledgment.allocations, quantity: acknowledgment.quantity },
        })
      }
      return { acknowledgment }
    })
    if ('error' in result) {
      return NextResponse.json(result, { status: result.error === 'order_not_found' ? 404 : 409 })
    }
    return NextResponse.json({ ok: true, ...result.acknowledgment })
  } catch (error) {
    logApiError('[admin/orders/stock-acknowledgment]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
