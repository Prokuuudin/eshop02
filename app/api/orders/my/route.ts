import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const rows = await prisma.order.findMany({
      where: { OR: [{ userId: user.id }, { email: user.email }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const orders = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))

    return NextResponse.json({ orders })
  } catch (e) {
    logApiError("[orders/my GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


