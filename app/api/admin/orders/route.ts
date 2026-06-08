import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const status = searchParams.get('status') || ''
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
