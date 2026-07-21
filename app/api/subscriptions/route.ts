import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const SUBSCRIPTION_DISCOUNTS = { monthly: 10, quarterly: 7 } as const
type SubscriptionInterval = keyof typeof SUBSCRIPTION_DISCOUNTS

export async function GET() {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const where = user.platformRole === 'admin' ? {} : { userId: user.id }
    const subscriptions = await prisma.productSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({
        ...s,
        nextOrderDate: s.nextOrderDate.toISOString(),
        lastOrderDate: s.lastOrderDate?.toISOString() ?? null,
        remindedAt: s.remindedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.error('[subscriptions GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      id?: string
      productId?: string
      productTitle?: string
      productImage?: string
      pricePerUnit?: number
      discountPercent?: number
      quantity?: number
      interval?: string
      nextOrderDate?: string
    }

    if (!body.productId || !body.quantity || !body.interval || !body.nextOrderDate) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!(body.interval in SUBSCRIPTION_DISCOUNTS)) {
      return NextResponse.json({ error: 'invalid_interval' }, { status: 400 })
    }
    if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100) {
      return NextResponse.json({ error: 'invalid_quantity' }, { status: 400 })
    }
    const nextOrderDate = new Date(body.nextOrderDate)
    if (Number.isNaN(nextOrderDate.getTime())) {
      return NextResponse.json({ error: 'invalid_next_order_date' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, title: true, image: true, price: true, isActive: true, isDeleted: true },
    })
    if (!product || !product.isActive || product.isDeleted) {
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
    }
    const interval = body.interval as SubscriptionInterval

    // Always generate id server-side — never trust client-supplied id
    const sub = await prisma.productSubscription.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        userEmail: user.email,
        productId: product.id,
        productTitle: product.title,
        productImage: product.image,
        pricePerUnit: product.price,
        discountPercent: SUBSCRIPTION_DISCOUNTS[interval],
        quantity: body.quantity,
        interval,
        status: 'active',
        nextOrderDate,
      },
    })

    return NextResponse.json({ subscriptionId: sub.id }, { status: 201 })
  } catch (e) {
    console.error('[subscriptions POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
