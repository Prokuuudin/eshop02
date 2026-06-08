import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

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

    if (!body.productId || !body.pricePerUnit || !body.quantity || !body.interval || !body.nextOrderDate) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Always generate id server-side — never trust client-supplied id
    const sub = await prisma.productSubscription.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        userEmail: user.email,
        productId: body.productId,
        productTitle: body.productTitle ?? '',
        productImage: body.productImage ?? null,
        pricePerUnit: body.pricePerUnit,
        discountPercent: body.discountPercent ?? 0,
        quantity: body.quantity,
        interval: body.interval,
        status: 'active',
        nextOrderDate: new Date(body.nextOrderDate),
      },
    })

    return NextResponse.json({ subscriptionId: sub.id }, { status: 201 })
  } catch (e) {
    console.error('[subscriptions POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
