import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export interface CustomerRow {
  email: string
  firstName: string
  lastName: string
  totalOrders: number
  totalSpent: number
  lastOrderDate: string | null
}

export async function GET() {
  const user = await getServerUser()
  if (!user || user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      email: true,
      firstName: true,
      lastName: true,
      total: true,
      createdAt: true,
    },
  })

  const map = new Map<string, CustomerRow>()

  for (const order of orders) {
    const email = order.email
    if (!email) continue

    const orderDate =
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : String(order.createdAt)

    const existing = map.get(email)
    if (!existing) {
      map.set(email, {
        email,
        firstName: order.firstName,
        lastName: order.lastName,
        totalOrders: 1,
        totalSpent: order.total ?? 0,
        lastOrderDate: orderDate,
      })
    } else {
      existing.totalOrders += 1
      existing.totalSpent += order.total ?? 0
      // orders are sorted desc; first occurrence is most recent
      // keep firstName/lastName from the most recent order (already set on first insert)
    }
  }

  const customers = Array.from(map.values())

  return NextResponse.json({ customers, total: customers.length })
}
