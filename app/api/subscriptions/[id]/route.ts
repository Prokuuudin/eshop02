import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['active', 'paused', 'cancelled'])
const ALLOWED_INTERVALS = new Set(['monthly', 'quarterly'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.productSubscription.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (sub.userId !== user.id && user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as {
      status?: string
      interval?: string
      quantity?: number
      nextOrderDate?: string
      lastOrderDate?: string
      remindedAt?: string
    }

    const data: Record<string, unknown> = {}
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
      }
      data.status = body.status
    }
    if (body.interval !== undefined) {
      if (!ALLOWED_INTERVALS.has(body.interval)) {
        return NextResponse.json({ error: 'invalid_interval' }, { status: 400 })
      }
      data.interval = body.interval
    }
    if (body.quantity !== undefined) data.quantity = Math.max(1, Number(body.quantity))
    if (body.nextOrderDate !== undefined) data.nextOrderDate = new Date(body.nextOrderDate)
    if (body.lastOrderDate !== undefined) data.lastOrderDate = new Date(body.lastOrderDate)
    if (body.remindedAt !== undefined) data.remindedAt = new Date(body.remindedAt)

    const updated = await prisma.productSubscription.update({ where: { id }, data })
    return NextResponse.json({
      subscription: {
        ...updated,
        nextOrderDate: updated.nextOrderDate.toISOString(),
        lastOrderDate: updated.lastOrderDate?.toISOString() ?? null,
        remindedAt: updated.remindedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  } catch (e) {
    console.error('[subscriptions/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
