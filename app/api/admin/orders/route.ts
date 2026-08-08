import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { AdminOrderUpdateError, updateServerOrderByAdmin } from '@/lib/orders-data-store'
import { parseOffsetPagination } from '@/lib/pagination'
import { adminOrderUpdateSchema } from '@/lib/api-schemas'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const payment = searchParams.get('payment') || ''
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 200 })

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
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ])

    const mapped = orders.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))

    return NextResponse.json({ orders: mapped, total })
  } catch (e) {
    logApiError("[admin/orders GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await requireAdminPermission('orders.update')
  if (user instanceof NextResponse) return user

  const parsed = adminOrderUpdateSchema.safeParse(await req.json().catch(() => null))
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
    logApiError("[admin/orders PATCH]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


