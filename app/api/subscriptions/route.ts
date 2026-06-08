import { NextRequest, NextResponse } from 'next/server'
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

    if (!body.id || !body.productId || !body.pricePerUnit || !body.quantity || !body.interval || !body.nextOrderDate) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const sub = await prisma.productSubscription.upsert({
      where: { id: body.id },
      create: {
        id: body.id,
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
      update: {},
    })

    return NextResponse.json({
      subscription: { ...sub, nextOrderDate: sub.nextOrderDate.toISOString(), createdAt: sub.createdAt.toISOString() },
    })
  } catch (e) {
    console.error('[subscriptions POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
