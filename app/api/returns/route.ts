import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

type ReturnItem = { productId: string; quantity: number }
type OrderItem = { id: string; price: number; quantity: number }

const ALLOWED_REASONS = new Set([
  'defective', 'wrong_item', 'changed_mind', 'not_as_described', 'damaged', 'other',
])

class ReturnValidationError extends Error {
  constructor(readonly error: string, readonly status: number, readonly productId?: string) {
    super(error)
  }
}

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034' || attempt >= 2) throw error
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0', 10) || 0
    const take = Math.min(200, parseInt(req.nextUrl.searchParams.get('take') || '100', 10) || 100)
    const where = user.platformRole === 'admin' ? {} : { email: user.email }
    const [returns, total] = await Promise.all([
      prisma.returnRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.returnRequest.count({ where }),
    ])
    return NextResponse.json({
      returns: returns.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        resolvedAt: item.resolvedAt?.toISOString() ?? null,
      })),
      total,
    })
  } catch (error) {
    console.error('[returns GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      orderId?: string; reason?: string; comment?: string; items?: ReturnItem[]
      firstName?: string; lastName?: string; phone?: string
    }
    if (!body.orderId || !body.reason || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!ALLOWED_REASONS.has(body.reason)) {
      return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
    }

    // Combining duplicate rows closes the `same product twice in one request` bypass.
    const requested = new Map<string, number>()
    for (const item of body.items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json({ error: 'invalid_item' }, { status: 400 })
      }
      requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity)
    }
    const items = [...requested].map(([productId, quantity]) => ({ productId, quantity }))

    const result = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: body.orderId! } })
      if (!order) throw new ReturnValidationError('order_not_found', 404)
      if (user.platformRole !== 'admin' && order.email !== user.email) {
        throw new ReturnValidationError('forbidden', 403)
      }

      const orderByProduct = new Map((order.items as OrderItem[]).map((item) => [item.id, item]))
      const priorReturns = await tx.returnRequest.findMany({
        where: { orderId: body.orderId },
        select: { items: true },
      })
      const reserved = new Map<string, number>()
      for (const prior of priorReturns) {
        for (const item of prior.items as ReturnItem[]) {
          if (item.productId && Number.isInteger(item.quantity) && item.quantity > 0) {
            reserved.set(item.productId, (reserved.get(item.productId) ?? 0) + item.quantity)
          }
        }
      }

      let refundAmount = 0
      for (const item of items) {
        const ordered = orderByProduct.get(item.productId)
        if (!ordered) throw new ReturnValidationError('item_not_in_order', 400, item.productId)
        if ((reserved.get(item.productId) ?? 0) + item.quantity > ordered.quantity) {
          throw new ReturnValidationError('quantity_exceeds_order', 400, item.productId)
        }
        refundAmount += ordered.price * item.quantity
      }

      return tx.returnRequest.create({
        data: {
          id: randomUUID(), orderId: body.orderId!, reason: body.reason!, items, refundAmount,
          comment: typeof body.comment === 'string' ? body.comment : null,
          firstName: typeof body.firstName === 'string' ? body.firstName : (user.name ?? ''),
          lastName: typeof body.lastName === 'string' ? body.lastName : '',
          email: user.email,
          phone: typeof body.phone === 'string' ? body.phone : '',
          status: 'pending',
        },
      })
    }, { isolationLevel: 'Serializable' }))

    return NextResponse.json({ returnId: result.id }, { status: 201 })
  } catch (error) {
    if (error instanceof ReturnValidationError) {
      return NextResponse.json(
        { error: error.error, ...(error.productId ? { productId: error.productId } : {}) },
        { status: error.status },
      )
    }
    console.error('[returns POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
