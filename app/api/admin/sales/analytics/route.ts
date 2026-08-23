import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

const PERIOD_DAYS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
}

type TotalsRow = { orderCount: number; revenue: number; uniqueCustomers: number }
type ChartRow = { day: Date; revenue: number; orderCount: number }
type ProductRow = { id: string; title: string; qty: number; revenue: number }
type CategoryRow = { cat: string; qty: number; revenue: number }

// Aggregates are computed server-side (indexed scans + a jsonb_array_elements
// unnest for line items) instead of shipping the entire admin order table to
// the browser to be summed there - the order history runs into the
// thousands, and the previous client-side version loaded all of it via
// useAdminOrdersSync just to reduce it to a handful of numbers.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const periodParam = req.nextUrl.searchParams.get('period') ?? '30d'
    const days = periodParam in PERIOD_DAYS ? PERIOD_DAYS[periodParam] : 30
    const cutoff = days != null ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null

    const dateWhere = cutoff ? Prisma.sql`WHERE o."createdAt" >= ${cutoff}` : Prisma.empty
    const dateAnd = cutoff ? Prisma.sql`AND o."createdAt" >= ${cutoff}` : Prisma.empty

    const [totalsRows, chartRows, productRows, categoryRows] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(o.total), 0)::float8 AS "revenue",
          COUNT(DISTINCT o.email)::int AS "uniqueCustomers"
        FROM "Order" o
        ${dateWhere}
      `,
      prisma.$queryRaw<ChartRow[]>`
        SELECT
          date_trunc('day', o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Riga')::date AS day,
          COALESCE(SUM(o.total), 0)::float8 AS "revenue",
          COUNT(*)::int AS "orderCount"
        FROM "Order" o
        ${dateWhere}
        GROUP BY day
        ORDER BY day
      `,
      prisma.$queryRaw<ProductRow[]>`
        SELECT
          item->>'id' AS id,
          MAX(item->>'title') AS title,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL ${dateAnd}
        GROUP BY item->>'id'
        ORDER BY revenue DESC
        LIMIT 10
      `,
      prisma.$queryRaw<CategoryRow[]>`
        SELECT
          COALESCE(item->>'category', '—') AS cat,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
        GROUP BY cat
        ORDER BY revenue DESC
      `,
    ])

    const totals = totalsRows[0] ?? { orderCount: 0, revenue: 0, uniqueCustomers: 0 }

    return NextResponse.json({
      orderCount: totals.orderCount,
      revenue: totals.revenue,
      uniqueCustomers: totals.uniqueCustomers,
      revenueByDay: chartRows.map((row) => ({
        date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
        value: row.revenue,
      })),
      ordersByDay: chartRows.map((row) => ({
        date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
        value: row.orderCount,
      })),
      topProducts: productRows.map((row) => ({ id: row.id, title: row.title, qty: row.qty, revenue: row.revenue })),
      topCategories: categoryRows.map((row) => ({ cat: row.cat, qty: row.qty, revenue: row.revenue })),
    })
  } catch (e) {
    logApiError('[admin/sales/analytics GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
