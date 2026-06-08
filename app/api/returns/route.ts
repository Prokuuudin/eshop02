import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const skip = parseInt(searchParams.get('skip') || '0', 10) || 0
    const take = Math.min(200, parseInt(searchParams.get('take') || '100', 10) || 100)

    const where = user.platformRole === 'admin' ? {} : { email: user.email }

    const [returns, total] = await Promise.all([
      prisma.returnRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.returnRequest.count({ where }),
    ])

    return NextResponse.json({
      returns: returns.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      total,
    })
  } catch (e) {
    console.error('[returns GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

type ReturnItemInput = { productId: string; quantity: number }
type OrderItem = { id: string; price: number; quantity: number }

const ALLOWED_REASONS = new Set([
  'defective', 'wrong_item', 'changed_mind', 'not_as_described', 'damaged', 'other',
])

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { orderId, reason, comment, items, firstName, lastName, phone } = body as {
      orderId?: string
      reason?: string
      comment?: string
      items?: ReturnItemInput[]
      firstName?: string
      lastName?: string
      phone?: string
    }

    if (!orderId || !reason || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
    }

    // Verify order ownership — prevent IDOR
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    if (user.platformRole !== 'admin' && order.email !== user.email) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Validate return items are a subset of order items + compute refundAmount server-side
    const orderItems = order.items as OrderItem[]
    const orderMap = new Map(orderItems.map((i) => [i.id, i]))
    let refundAmount = 0
    const validatedItems: ReturnItemInput[] = []

    for (const item of items) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity < 1) {
        return NextResponse.json({ error: 'invalid_item' }, { status: 400 })
      }
      const orderItem = orderMap.get(item.productId)
      if (!orderItem) {
        return NextResponse.json({ error: 'item_not_in_order', productId: item.productId }, { status: 400 })
      }
      if (item.quantity > orderItem.quantity) {
        return NextResponse.json({ error: 'quantity_exceeds_order', productId: item.productId }, { status: 400 })
      }
      refundAmount += orderItem.price * item.quantity
      validatedItems.push({ productId: item.productId, quantity: item.quantity })
    }

    const ret = await prisma.returnRequest.create({
      data: {
        id: randomUUID(),
        orderId,
        reason,
        comment: typeof comment === 'string' ? comment : null,
        items: validatedItems,
        refundAmount,
        firstName: typeof firstName === 'string' ? firstName : (user.name ?? ''),
        lastName: typeof lastName === 'string' ? lastName : '',
        email: user.email,
        phone: typeof phone === 'string' ? phone : '',
        status: 'pending',
      },
    })

    // Only return the server-assigned id — not the full record (limits PII exposure)
    return NextResponse.json({ returnId: ret.id }, { status: 201 })
  } catch (e) {
    console.error('[returns POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
