import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { toNum } from '@/lib/decimal'

export const runtime = 'nodejs'

export interface CustomerRow {
  email: string
  firstName: string
  lastName: string
  totalOrders: number
  totalSpent: number
  lastOrderDate: string | null
}

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  if (!user || user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Intentionally unbounded (no `take`): a cap here silently drops older orders
  // from the aggregation, which undercounts exactly the customers the
  // "Неактивный" (inactive) segment on /admin/customers/segments exists to find
  // - their most recent order is old, so it's the first thing a recency-sorted
  // cap would cut. At ~8.7k orders this is a single indexed scan pulling only
  // the 5 columns actually needed, which is cheap; a DB-side groupBy was
  // considered but can't also recover per-customer firstName/lastName from the
  // most recent order, so aggregation stays in JS.
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
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
    // Group by normalized email so the same person checking out with different
    // casing (Foo@Bar.com vs foo@bar.com) collapses into one row instead of
    // splitting totals/segment membership across two. The displayed `email`
    // keeps the first-seen casing (orders are sorted desc, so that's the most
    // recent order's casing).
    const rawEmail = order.email?.trim()
    if (!rawEmail) continue
    const normalizedEmail = rawEmail.toLowerCase()

    const orderDate =
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : String(order.createdAt)

    const existing = map.get(normalizedEmail)
    if (!existing) {
      map.set(normalizedEmail, {
        email: rawEmail,
        firstName: order.firstName,
        lastName: order.lastName,
        totalOrders: 1,
        totalSpent: toNum(order.total ?? 0),
        lastOrderDate: orderDate,
      })
    } else {
      existing.totalOrders += 1
      existing.totalSpent += toNum(order.total ?? 0)
      // orders are sorted desc; first occurrence is most recent
      // keep firstName/lastName from the most recent order (already set on first insert)
    }
  }

  // A historical order may contain legacy text decoded with the wrong charset. The current
  // account profile is authoritative for the customer's display name; order data is only a
  // fallback for guest customers without an account.
  const customerEmails = Array.from(map.keys())
  if (customerEmails.length) {
    const registeredUsers = await prisma.user.findMany({
      where: { email: { in: customerEmails, mode: 'insensitive' } },
      select: { email: true, name: true },
    })
    for (const registeredUser of registeredUsers) {
      const customer = map.get(registeredUser.email.toLowerCase().trim())
      const fullName = registeredUser.name?.trim()
      if (!customer || !fullName) continue
      const [firstName, ...lastNameParts] = fullName.split(/\s+/)
      customer.firstName = firstName
      customer.lastName = lastNameParts.join(' ')
    }
  }

  const customers = Array.from(map.values())

  return NextResponse.json({ customers, total: customers.length })
}
