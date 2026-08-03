import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { z } from 'zod'
import { AdminOrderUpdateError, updateServerOrderByAdmin } from '@/lib/orders-data-store'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const payment = searchParams.get('payment') || ''
    const skip = parseInt(searchParams.get('skip') || '0', 10)
    const take = parseInt(searchParams.get('take') || '50', 10)

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (payment) where.paymentStatus = payment

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: isNaN(skip) ? 0 : skip,
        take: isNaN(take) ? 50 : Math.min(take, 200),
      }),
      prisma.order.count({ where }),
    ])

    const mapped = orders.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))

    return NextResponse.json({ orders: mapped, total })
  } catch (e) {
    console.error('[admin/orders GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

const updateOrderSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
    lineKey: z.string().trim().max(300).optional(),
    variantLabel: z.string().trim().max(300).optional(),
  })).min(1).max(500),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(200),
  postalCode: z.string().trim().max(50).optional(),
  deliveryMethod: z.enum(['courier', 'pickup', 'post']),
})

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await requireAdminPermission('orders.update')
  if (user instanceof NextResponse) return user

  const parsed = updateOrderSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_order_update', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { orderId, ...input } = parsed.data
    const order = await updateServerOrderByAdmin(orderId, input, user, req)
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof AdminOrderUpdateError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'insufficient_stock' ? 409 : 422
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }
    console.error('[admin/orders PATCH]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
