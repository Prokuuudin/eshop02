import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

const ALLOWED_CHART_DAYS = [7, 30, 90] as const
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const

type TotalsRow = { orderCount: number; revenue: number; itemsSold: number }
type StatusRow = { status: string; count: number }
type ChartRow = { day: Date; revenue: number; orderCount: number }

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const requestedDays = parseInt(req.nextUrl.searchParams.get('days') ?? '', 10)
    const days = ALLOWED_CHART_DAYS.includes(requestedDays as (typeof ALLOWED_CHART_DAYS)[number])
      ? requestedDays
      : 30
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Aggregates are computed server-side (single indexed scan) instead of
    // shipping every Order row to the browser to be summed there - the admin
    // order history can run into the thousands. "cancelled" orders are
    // excluded (OrderStatusRecord is sparse: no row means the order is still
    // 'pending', matching the same fallback used everywhere else in the app).
    const [totalsRows, statusRows, chartRows] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(o.total), 0)::float8 AS "revenue",
          COALESCE(SUM(jsonb_array_length(o.items::jsonb)), 0)::int AS "itemsSold"
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        WHERE COALESCE(osr.status, 'pending') <> 'cancelled'
      `,
      prisma.$queryRaw<StatusRow[]>`
        SELECT COALESCE(osr.status, 'pending') AS status, COUNT(*)::int AS count
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        GROUP BY COALESCE(osr.status, 'pending')
      `,
      prisma.$queryRaw<ChartRow[]>`
        SELECT
          date_trunc('day', o."createdAt")::date AS day,
          COALESCE(SUM(o.total), 0)::float8 AS "revenue",
          COUNT(*)::int AS "orderCount"
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        WHERE o."createdAt" >= ${cutoff}
          AND COALESCE(osr.status, 'pending') <> 'cancelled'
        GROUP BY day
        ORDER BY day
      `,
    ])

    const totals = totalsRows[0] ?? { orderCount: 0, revenue: 0, itemsSold: 0 }
    const avgOrderValue = totals.orderCount > 0 ? Math.round(totals.revenue / totals.orderCount) : 0

    const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
      (typeof ORDER_STATUSES)[number],
      number
    >
    for (const row of statusRows) {
      if ((ORDER_STATUSES as readonly string[]).includes(row.status)) {
        statusCounts[row.status as (typeof ORDER_STATUSES)[number]] = row.count
      }
    }

    return NextResponse.json({
      orderCount: totals.orderCount,
      revenue: totals.revenue,
      avgOrderValue,
      itemsSold: totals.itemsSold,
      statusCounts,
      chart: chartRows.map((row) => ({
        date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
        revenue: row.revenue,
        orderCount: row.orderCount,
      })),
    })
  } catch (e) {
    logApiError("[admin/orders/stats GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


