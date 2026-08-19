import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const subscriptions = await prisma.productNewsSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    })
  } catch (e) {
    logApiError('[product-news GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      productId?: string
      notifyPrice?: boolean
      notifyStock?: boolean
      notifyPromo?: boolean
    }
    if (!body.productId) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

    const notifyPrice = body.notifyPrice ?? true
    const notifyStock = body.notifyStock ?? true
    const notifyPromo = body.notifyPromo ?? true
    if (!notifyPrice && !notifyStock && !notifyPromo) {
      return NextResponse.json({ error: 'select_at_least_one' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, title: true, isActive: true, isDeleted: true },
    })
    if (!product || !product.isActive || product.isDeleted) {
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
    }

    const sub = await prisma.productNewsSubscription.upsert({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      create: {
        id: randomUUID(),
        userId: user.id,
        productId: product.id,
        productTitle: product.title,
        notifyPrice,
        notifyStock,
        notifyPromo,
      },
      update: { notifyPrice, notifyStock, notifyPromo },
    })

    return NextResponse.json({ subscriptionId: sub.id }, { status: 201 })
  } catch (e) {
    logApiError('[product-news POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
