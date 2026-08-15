import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { parseOffsetPagination } from '@/lib/pagination'
import { returnRequestSchema } from '@/lib/api-schemas'

export const runtime = 'nodejs'

type ReturnItem = { productId: string; quantity: number }
type OrderItem = { id: string; price: number; quantity: number }

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

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { skip, take } = parseOffsetPagination(req.nextUrl.searchParams)
    // Admins may scope the list to a single customer (e.g. the customer profile
    // page's Returns tab) via ?email=. Non-admins are always scoped to their own
    // email regardless of this param. Omitting it keeps the existing unfiltered
    // behavior for callers like the /admin/returns page.
    const emailFilter = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() || undefined
    const where = user.platformRole === 'admin'
      ? (emailFilter ? { email: { equals: emailFilter, mode: 'insensitive' as const } } : {})
      : { email: user.email }
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
    logApiError("[returns GET]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const parsed = returnRequestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_return_request', issues: parsed.error.issues }, { status: 400 })
    const body = parsed.data

    // Combining duplicate rows closes the `same product twice in one request` bypass.
    const requested = new Map<string, number>()
    for (const item of body.items) {
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
    logApiError("[returns POST]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


