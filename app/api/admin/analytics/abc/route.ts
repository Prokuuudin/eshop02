import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { Prisma } from '@/generated/prisma/client'

type AbcRow = { id: string; title: string; brand: string; qty: number; revenue: number; revenuePct: number; cumPct: number; grade: 'A' | 'B' | 'C' }
type AbcQueryResult = { rows: AbcRow[]; total: number; summary: Partial<Record<'A' | 'B' | 'C', { count: number; revenue: number }>> }

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment. Ranking + cumulative revenue share is computed via a
// window function instead of reducing the entire order history in the
// browser. The page, filtered count and unfiltered grade summary are returned
// by one statement so the expensive order-item aggregation only runs once.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(req.nextUrl.searchParams.get('pageSize') ?? '25', 10) || 25))
    const search = req.nextUrl.searchParams.get('search')?.trim() ?? ''
    const requestedGrade = req.nextUrl.searchParams.get('grade')
    const grade = requestedGrade === 'A' || requestedGrade === 'B' || requestedGrade === 'C' ? requestedGrade : null
    const requestedPeriod = req.nextUrl.searchParams.get('period') ?? 'all'
    const periodDays = requestedPeriod === '30d' ? 30 : requestedPeriod === '90d' ? 90 : requestedPeriod === '365d' ? 365 : null
    const period = periodDays ? requestedPeriod : 'all'
    const cutoff = periodDays ? new Date(Date.now() - periodDays * 86_400_000) : null
    const dateFilter = cutoff ? Prisma.sql`AND o."createdAt" >= ${cutoff}` : Prisma.empty
    const exportCsv = req.nextUrl.searchParams.get('export') === 'csv'
    const offset = (page - 1) * pageSize
    const searchFilter = search ? Prisma.sql`AND (title ILIKE ${`%${search}%`} OR brand ILIKE ${`%${search}%`})` : Prisma.empty
    const gradeFilter = grade ? Prisma.sql`AND grade = ${grade}` : Prisma.empty
    const baseQuery = Prisma.sql`
      WITH item_agg AS (
        SELECT
          item->>'id' AS id,
          MAX(item->>'title') AS title,
          MAX(COALESCE(item->>'brand', '—')) AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        CROSS JOIN LATERAL jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL
          AND COALESCE(osr.status, 'pending') <> 'cancelled'
          ${dateFilter}
        GROUP BY item->>'id'
      ),
      totals AS (
        SELECT SUM(revenue) AS grand FROM item_agg
      ), ranked AS (
        SELECT item_agg.*,
          (item_agg.revenue / NULLIF(totals.grand, 0))::float8 AS "revenuePct",
          (SUM(item_agg.revenue) OVER (ORDER BY item_agg.revenue DESC, item_agg.id) / NULLIF(totals.grand, 0))::float8 AS "cumPct"
        FROM item_agg, totals
      ), classified AS (
        SELECT *, CASE
          WHEN "cumPct" - "revenuePct" < 0.8 THEN 'A'
          WHEN "cumPct" - "revenuePct" < 0.95 THEN 'B'
          ELSE 'C'
        END AS grade
        FROM ranked
      )
    `

    const resultRows = await prisma.$queryRaw<AbcQueryResult[]>(Prisma.sql`
      ${baseQuery},
      filtered AS (
        SELECT * FROM classified WHERE true ${searchFilter} ${gradeFilter}
      ), page_rows AS (
        SELECT * FROM filtered ORDER BY revenue DESC, id LIMIT ${exportCsv ? 100_000 : pageSize} OFFSET ${exportCsv ? 0 : offset}
      ), grade_summary AS (
        SELECT grade, COUNT(*)::int AS count, COALESCE(SUM(revenue), 0)::float8 AS revenue
        FROM classified GROUP BY grade
      )
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY revenue DESC, id) FROM page_rows), '[]'::jsonb) AS rows,
        (SELECT COUNT(*)::int FROM filtered) AS total,
        COALESCE((SELECT jsonb_object_agg(grade, jsonb_build_object('count', count, 'revenue', revenue)) FROM grade_summary), '{}'::jsonb) AS summary
    `)

    const summary = Object.fromEntries(['A', 'B', 'C'].map((key) => [key, { count: 0, revenue: 0 }])) as Record<'A' | 'B' | 'C', { count: number; revenue: number }>
    const result = resultRows[0]
    Object.assign(summary, result?.summary ?? {})
    if (exportCsv) {
      const csv = [
        ['Product ID', 'Title', 'Brand', 'Quantity', 'Revenue', 'Revenue %', 'Cumulative %', 'Grade'],
        ...(result?.rows ?? []).map((row) => [row.id, row.title, row.brand, row.qty, row.revenue, row.revenuePct, row.cumPct, row.grade]),
      ].map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
      return new NextResponse(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="abc-analysis-${period}.csv"` } })
    }
    return NextResponse.json({ rows: result?.rows ?? [], total: result?.total ?? 0, page, pageSize, summary, period })
  } catch (e) {
    logApiError('[admin/analytics/abc GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
