import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

const ALLOWED_CHART_DAYS = [7, 30, 90] as const
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const

type TotalsRow = {
  orderCount: number; totalOrderCount: number; revenue: number; shippedDeliveredRevenue: number; itemsSold: number
  todayOrderCount: number; last7DaysOrderCount: number; last7DaysRevenue: number
}
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
          COUNT(*) FILTER (WHERE COALESCE(osr.status, 'pending') <> 'cancelled')::int AS "orderCount",
          COUNT(*)::int AS "totalOrderCount",
          COALESCE(SUM(o.total) FILTER (WHERE COALESCE(osr.status, 'pending') <> 'cancelled'), 0)::float8 AS "revenue",
          COALESCE(SUM(o.total) FILTER (WHERE COALESCE(osr.status, 'pending') IN ('shipped', 'delivered')), 0)::float8 AS "shippedDeliveredRevenue",
          COALESCE(SUM(jsonb_array_length(o.items::jsonb)) FILTER (WHERE COALESCE(osr.status, 'pending') <> 'cancelled'), 0)::int AS "itemsSold",
          COUNT(*) FILTER (
            WHERE (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Riga')
              >= date_trunc('day', now() AT TIME ZONE 'Europe/Riga')
          )::int AS "todayOrderCount",
          COUNT(*) FILTER (WHERE o."createdAt" >= now() - interval '7 days')::int AS "last7DaysOrderCount",
          COALESCE(SUM(o.total) FILTER (WHERE o."createdAt" >= now() - interval '7 days'), 0)::float8 AS "last7DaysRevenue"
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
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

    const totals = totalsRows[0] ?? {
      orderCount: 0, totalOrderCount: 0, revenue: 0, shippedDeliveredRevenue: 0, itemsSold: 0,
      todayOrderCount: 0, last7DaysOrderCount: 0, last7DaysRevenue: 0,
    }
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
      totalOrderCount: totals.totalOrderCount,
      revenue: totals.revenue,
      shippedDeliveredRevenue: totals.shippedDeliveredRevenue,
      avgOrderValue,
      itemsSold: totals.itemsSold,
      todayOrderCount: totals.todayOrderCount,
      last7DaysOrderCount: totals.last7DaysOrderCount,
      last7DaysRevenue: totals.last7DaysRevenue,
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


