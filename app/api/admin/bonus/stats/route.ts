import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'

const HISTORY_LIMIT = 50

type TotalsRow = { totalEarned: number; totalSpent: number; ordersWithBonus: number }
type HistoryRow = {
  id: string
  createdAt: Date
  firstName: string
  lastName: string
  email: string
  total: number
  bonusEarned: number | null
  bonusSpent: number | null
}

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment. Previously this page pulled the entire admin order
// table into the browser (useAdminOrdersSync) just to sum two columns and
// show the latest bonus-related orders.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireAdmin()
    if (actor instanceof NextResponse) return actor

    const [totalsRows, historyRows] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COALESCE(SUM(o."bonusEarned"), 0)::float8 AS "totalEarned",
          COALESCE(SUM(o."bonusSpent"), 0)::float8 AS "totalSpent",
          COUNT(*) FILTER (WHERE COALESCE(o."bonusEarned", 0) > 0 OR COALESCE(o."bonusSpent", 0) > 0)::int AS "ordersWithBonus"
        FROM "Order" o
      `,
      prisma.$queryRaw<HistoryRow[]>`
        SELECT
          o.id, o."createdAt", o."firstName", o."lastName", o.email,
          o.total::float8 AS total, o."bonusEarned", o."bonusSpent"
        FROM "Order" o
        WHERE COALESCE(o."bonusEarned", 0) > 0 OR COALESCE(o."bonusSpent", 0) > 0
        ORDER BY o."createdAt" DESC
        LIMIT ${HISTORY_LIMIT}
      `,
    ])

    const totals = totalsRows[0] ?? { totalEarned: 0, totalSpent: 0, ordersWithBonus: 0 }

    return NextResponse.json({
      totalEarned: totals.totalEarned,
      totalSpent: totals.totalSpent,
      ordersWithBonus: totals.ordersWithBonus,
      history: historyRows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        total: row.total,
        bonusEarned: row.bonusEarned ?? 0,
        bonusSpent: row.bonusSpent ?? 0,
      })),
    })
  } catch (e) {
    logApiError('[admin/bonus/stats GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
