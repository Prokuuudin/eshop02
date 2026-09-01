import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

type SizeRow = { cohort: Date; size: number }
type CellRow = { cohort: Date; offset: number; count: number }

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment. "Cohort month" (each customer's first purchase
// month) and the retention matrix are computed in SQL instead of scanning
// every order in the browser to reconstruct them.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const requestedMonths = Number.parseInt(_req.nextUrl.searchParams.get('months') ?? '12', 10)
    const months = [6, 12, 24, 36].includes(requestedMonths) ? requestedMonths : 12
    const now = new Date()
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1))
    const [sizeRows, cellRows] = await Promise.all([
      prisma.$queryRaw<SizeRow[]>`
        WITH first_month AS (
          SELECT lower(trim(email)) AS customer_email, MIN(date_trunc('month', "createdAt"))::date AS cohort_month
          FROM "Order" o
          LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
          WHERE email IS NOT NULL AND email <> ''
            AND COALESCE(osr.status, 'pending') <> 'cancelled'
          GROUP BY lower(trim(email))
          HAVING MIN(date_trunc('month', o."createdAt")) >= ${cutoff}
        )
        SELECT cohort_month AS cohort, COUNT(*)::int AS size
        FROM first_month
        GROUP BY cohort_month
        ORDER BY cohort_month
      `,
      prisma.$queryRaw<CellRow[]>`
        WITH first_month AS (
          SELECT lower(trim(email)) AS customer_email, MIN(date_trunc('month', "createdAt"))::date AS cohort_month
          FROM "Order" o
          LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
          WHERE email IS NOT NULL AND email <> ''
            AND COALESCE(osr.status, 'pending') <> 'cancelled'
          GROUP BY lower(trim(email))
          HAVING MIN(date_trunc('month', o."createdAt")) >= ${cutoff}
        ),
        order_months AS (
          SELECT DISTINCT lower(trim(o.email)) AS customer_email, date_trunc('month', o."createdAt")::date AS order_month
          FROM "Order" o
          LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
          WHERE o.email IS NOT NULL AND o.email <> ''
            AND COALESCE(osr.status, 'pending') <> 'cancelled'
        )
        SELECT
          fm.cohort_month AS cohort,
          ((EXTRACT(YEAR FROM om.order_month) - EXTRACT(YEAR FROM fm.cohort_month)) * 12 +
           (EXTRACT(MONTH FROM om.order_month) - EXTRACT(MONTH FROM fm.cohort_month)))::int AS "offset",
          COUNT(DISTINCT om.customer_email)::int AS count
        FROM order_months om
        JOIN first_month fm ON fm.customer_email = om.customer_email
        GROUP BY fm.cohort_month, "offset"
        ORDER BY cohort, "offset"
      `,
    ])

    const cellCounts = new Map(cellRows.map((row) => [`${row.cohort.toISOString().slice(0, 7)}:${row.offset}`, row.count]))
    const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    const retentionAt = (offset: number): number | null => {
      const eligible = sizeRows.filter((row) => {
        const cohort = row.cohort
        return Date.UTC(cohort.getUTCFullYear(), cohort.getUTCMonth() + offset, 1) <= currentMonth
      })
      const customers = eligible.reduce((sum, row) => sum + row.size, 0)
      if (customers === 0) return null
      const retained = eligible.reduce((sum, row) => sum + (cellCounts.get(`${row.cohort.toISOString().slice(0, 7)}:${offset}`) ?? 0), 0)
      return Math.round((retained / customers) * 1000) / 10
    }
    const latestSizes = sizeRows
      .filter((row) => row.cohort.getTime() < currentMonth)
      .sort((a, b) => b.cohort.getTime() - a.cohort.getTime())
    const cohortGrowth = latestSizes.length >= 2 && latestSizes[1].size > 0
      ? Math.round(((latestSizes[0].size - latestSizes[1].size) / latestSizes[1].size) * 1000) / 10
      : null

    return NextResponse.json({
      cohortSizes: sizeRows.map((row) => ({ cohort: row.cohort.toISOString().slice(0, 7), size: row.size })),
      cells: cellRows.map((row) => ({ cohort: row.cohort.toISOString().slice(0, 7), offset: row.offset, count: row.count })),
      months,
      summary: { m1: retentionAt(1), m3: retentionAt(3), m6: retentionAt(6), cohortGrowth },
    })
  } catch (e) {
    logApiError('[admin/analytics/cohorts GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
