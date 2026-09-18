import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
const url = z.union([z.literal(''), z.string().max(2000).url().refine(value => new URL(value).protocol === 'https:')])
const schema = z.object({
  orderId: z.string().min(1).max(100),
  shipmentCarrier: z.enum(['omniva', 'venipak', 'unisend', 'expresspasts', 'dpd', 'other']),
  trackingNumber: z.string().trim().min(1).max(200),
  trackingUrl: url,
  labelUrl: url,
}).strict()
export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('orders.update')
  if (actor instanceof NextResponse) return actor
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_shipment' }, { status: 400 })
  const { orderId, ...shipment } = parsed.data
  try {
    const updated = await prisma.$transaction(async tx => {
      const before = await tx.order.findUnique({ where: { id: orderId } })
      if (!before) return null
      const after = await tx.order.update({ where: { id: orderId }, data: { ...shipment, trackingUrl: shipment.trackingUrl || null, labelUrl: shipment.labelUrl || null } })
      await appendServerAudit(tx, request, actor, { action: 'order.shipment_updated', entityType: 'order', entityId: orderId, before: { trackingNumber: before.trackingNumber }, after: shipment })
      return after
    })
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'shipment_save_failed' }, { status: 500 })
  }
}
