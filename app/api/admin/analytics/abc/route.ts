import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

type AbcRow = { id: string; title: string; brand: string; qty: number; revenue: number; revenuePct: number; cumPct: number }

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment. Ranking + cumulative revenue share is computed via a
// window function instead of reducing the entire order history in the
// browser. Every distinct product is returned (ABC classification needs the
// full ranking, not a top-N slice) but that's a few hundred rows, not
// thousands of orders.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const rows = await prisma.$queryRaw<AbcRow[]>`
      WITH item_agg AS (
        SELECT
          item->>'id' AS id,
          MAX(item->>'title') AS title,
          MAX(COALESCE(item->>'brand', '—')) AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL
        GROUP BY item->>'id'
      ),
      totals AS (
        SELECT SUM(revenue) AS grand FROM item_agg
      )
      SELECT
        item_agg.id, item_agg.title, item_agg.brand, item_agg.qty, item_agg.revenue,
        (item_agg.revenue / NULLIF(totals.grand, 0))::float8 AS "revenuePct",
        (SUM(item_agg.revenue) OVER (ORDER BY item_agg.revenue DESC) / NULLIF(totals.grand, 0))::float8 AS "cumPct"
      FROM item_agg, totals
      ORDER BY item_agg.revenue DESC
    `

    return NextResponse.json({ rows })
  } catch (e) {
    logApiError('[admin/analytics/abc GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
