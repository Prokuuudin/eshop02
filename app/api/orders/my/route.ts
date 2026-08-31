import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const rawTake = Number(req.nextUrl.searchParams.get('take') ?? 50)
    const take = Number.isInteger(rawTake) ? Math.min(100, Math.max(1, rawTake)) : 50
    const cursor = req.nextUrl.searchParams.get('cursor') || undefined
    const rows = await prisma.order.findMany({
      where: { OR: [{ userId: user.id }, { email: user.email }] },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows
    const orders = page.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))

    return NextResponse.json({ orders, nextCursor: hasMore ? page.at(-1)?.id ?? null : null })
  } catch (e) {
    logApiError("[orders/my GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
