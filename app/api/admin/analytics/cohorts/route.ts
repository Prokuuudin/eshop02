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

    const [sizeRows, cellRows] = await Promise.all([
      prisma.$queryRaw<SizeRow[]>`
        WITH first_month AS (
          SELECT email, MIN(date_trunc('month', "createdAt"))::date AS cohort_month
          FROM "Order"
          WHERE email IS NOT NULL AND email <> ''
          GROUP BY email
        )
        SELECT cohort_month AS cohort, COUNT(*)::int AS size
        FROM first_month
        GROUP BY cohort_month
        ORDER BY cohort_month
      `,
      prisma.$queryRaw<CellRow[]>`
        WITH first_month AS (
          SELECT email, MIN(date_trunc('month', "createdAt"))::date AS cohort_month
          FROM "Order"
          WHERE email IS NOT NULL AND email <> ''
          GROUP BY email
        ),
        order_months AS (
          SELECT DISTINCT o.email, date_trunc('month', o."createdAt")::date AS order_month
          FROM "Order" o
          WHERE o.email IS NOT NULL AND o.email <> ''
        )
        SELECT
          fm.cohort_month AS cohort,
          ((EXTRACT(YEAR FROM om.order_month) - EXTRACT(YEAR FROM fm.cohort_month)) * 12 +
           (EXTRACT(MONTH FROM om.order_month) - EXTRACT(MONTH FROM fm.cohort_month)))::int AS offset,
          COUNT(DISTINCT om.email)::int AS count
        FROM order_months om
        JOIN first_month fm ON fm.email = om.email
        GROUP BY fm.cohort_month, offset
        ORDER BY cohort, offset
      `,
    ])

    return NextResponse.json({
      cohortSizes: sizeRows.map((row) => ({ cohort: row.cohort.toISOString().slice(0, 7), size: row.size })),
      cells: cellRows.map((row) => ({ cohort: row.cohort.toISOString().slice(0, 7), offset: row.offset, count: row.count })),
    })
  } catch (e) {
    logApiError('[admin/analytics/cohorts GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
