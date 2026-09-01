import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { Prisma } from '@/generated/prisma/client'

type AbcRow = { id: string; title: string; brand: string; qty: number; revenue: number; revenuePct: number; cumPct: number; grade: 'A' | 'B' | 'C'; xyzGrade: 'X' | 'Y' | 'Z'; variationCoeff: number | null }
type AbcQueryResult = { rows: AbcRow[]; total: number; summary: Partial<Record<'A' | 'B' | 'C', { count: number; revenue: number }>>; matrix: Partial<Record<string, { count: number; revenue: number }>> }

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
    const requestedXyz = req.nextUrl.searchParams.get('xyz')
    const xyz = requestedXyz === 'X' || requestedXyz === 'Y' || requestedXyz === 'Z' ? requestedXyz : null
    const requestedPeriod = req.nextUrl.searchParams.get('period') ?? 'all'
    const periodDays = requestedPeriod === '30d' ? 30 : requestedPeriod === '90d' ? 90 : requestedPeriod === '365d' ? 365 : null
    const period = periodDays ? requestedPeriod : 'all'
    const cutoff = periodDays ? new Date(Date.now() - periodDays * 86_400_000) : null
    const dateFilter = cutoff ? Prisma.sql`AND o."createdAt" >= ${cutoff}` : Prisma.empty
    const xyzCutoff = cutoff ?? new Date(Date.now() - 365 * 86_400_000)
    const bucketExpression = period === '30d'
      ? Prisma.sql`date_trunc('day', o."createdAt")`
      : period === '90d'
        ? Prisma.sql`date_trunc('week', o."createdAt")`
        : Prisma.sql`date_trunc('month', o."createdAt")`
    const bucketStart = period === '30d'
      ? Prisma.sql`date_trunc('day', ${xyzCutoff}::timestamp)`
      : period === '90d'
        ? Prisma.sql`date_trunc('week', ${xyzCutoff}::timestamp)`
        : Prisma.sql`date_trunc('month', ${xyzCutoff}::timestamp)`
    const bucketEnd = period === '30d'
      ? Prisma.sql`date_trunc('day', now())`
      : period === '90d'
        ? Prisma.sql`date_trunc('week', now())`
        : Prisma.sql`date_trunc('month', now())`
    const bucketStep = period === '30d' ? Prisma.sql`interval '1 day'` : period === '90d' ? Prisma.sql`interval '1 week'` : Prisma.sql`interval '1 month'`
    const exportCsv = req.nextUrl.searchParams.get('export') === 'csv'
    const offset = (page - 1) * pageSize
    const searchFilter = search ? Prisma.sql`AND (title ILIKE ${`%${search}%`} OR brand ILIKE ${`%${search}%`})` : Prisma.empty
    const gradeFilter = grade ? Prisma.sql`AND grade = ${grade}` : Prisma.empty
    const xyzFilter = xyz ? Prisma.sql`AND "xyzGrade" = ${xyz}` : Prisma.empty
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
      ), xyz_sales AS (
        SELECT item->>'id' AS id, ${bucketExpression} AS bucket,
          SUM(COALESCE((item->>'quantity')::numeric, 1))::float8 AS qty
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        CROSS JOIN LATERAL jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL
          AND COALESCE(osr.status, 'pending') <> 'cancelled'
          AND o."createdAt" >= ${xyzCutoff}
        GROUP BY item->>'id', bucket
      ), xyz_buckets AS (
        SELECT generate_series(${bucketStart}, ${bucketEnd}, ${bucketStep}) AS bucket
      ), xyz_stats AS (
        SELECT p.id,
          CASE WHEN AVG(COALESCE(s.qty, 0)) > 0
            THEN (STDDEV_POP(COALESCE(s.qty, 0)) / AVG(COALESCE(s.qty, 0)))::float8
            ELSE NULL END AS variation_coeff
        FROM item_agg p CROSS JOIN xyz_buckets b
        LEFT JOIN xyz_sales s ON s.id = p.id AND s.bucket = b.bucket
        GROUP BY p.id
      ), ranked AS (
        SELECT item_agg.*,
          (item_agg.revenue / NULLIF(totals.grand, 0))::float8 AS "revenuePct",
          (SUM(item_agg.revenue) OVER (ORDER BY item_agg.revenue DESC, item_agg.id) / NULLIF(totals.grand, 0))::float8 AS "cumPct"
        FROM item_agg, totals
      ), classified AS (
        SELECT ranked.*, CASE
          WHEN "cumPct" - "revenuePct" < 0.8 THEN 'A'
          WHEN "cumPct" - "revenuePct" < 0.95 THEN 'B'
          ELSE 'C'
        END AS grade,
        CASE WHEN xyz_stats.variation_coeff <= 0.10 THEN 'X'
          WHEN xyz_stats.variation_coeff <= 0.25 THEN 'Y'
          ELSE 'Z' END AS "xyzGrade",
        xyz_stats.variation_coeff AS "variationCoeff"
        FROM ranked JOIN xyz_stats ON xyz_stats.id = ranked.id
      )
    `

    const resultRows = await prisma.$queryRaw<AbcQueryResult[]>(Prisma.sql`
      ${baseQuery},
      filtered AS (
        SELECT * FROM classified WHERE true ${searchFilter} ${gradeFilter} ${xyzFilter}
      ), page_rows AS (
        SELECT * FROM filtered ORDER BY revenue DESC, id LIMIT ${exportCsv ? 100_000 : pageSize} OFFSET ${exportCsv ? 0 : offset}
      ), grade_summary AS (
        SELECT grade, COUNT(*)::int AS count, COALESCE(SUM(revenue), 0)::float8 AS revenue
        FROM classified GROUP BY grade
      ), matrix_summary AS (
        SELECT grade || "xyzGrade" AS cell, COUNT(*)::int AS count, COALESCE(SUM(revenue), 0)::float8 AS revenue
        FROM classified GROUP BY grade, "xyzGrade"
      )
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY revenue DESC, id) FROM page_rows), '[]'::jsonb) AS rows,
        (SELECT COUNT(*)::int FROM filtered) AS total,
        COALESCE((SELECT jsonb_object_agg(grade, jsonb_build_object('count', count, 'revenue', revenue)) FROM grade_summary), '{}'::jsonb) AS summary,
        COALESCE((SELECT jsonb_object_agg(cell, jsonb_build_object('count', count, 'revenue', revenue)) FROM matrix_summary), '{}'::jsonb) AS matrix
    `)

    const summary = Object.fromEntries(['A', 'B', 'C'].map((key) => [key, { count: 0, revenue: 0 }])) as Record<'A' | 'B' | 'C', { count: number; revenue: number }>
    const result = resultRows[0]
    Object.assign(summary, result?.summary ?? {})
    if (exportCsv) {
      const csv = [
        ['Product ID', 'Title', 'Brand', 'Quantity', 'Revenue', 'Revenue %', 'Cumulative %', 'ABC', 'XYZ', 'Variation coefficient'],
        ...(result?.rows ?? []).map((row) => [row.id, row.title, row.brand, row.qty, row.revenue, row.revenuePct, row.cumPct, row.grade, row.xyzGrade, row.variationCoeff ?? '']),
      ].map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
      return new NextResponse(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="abc-analysis-${period}.csv"` } })
    }
    return NextResponse.json({ rows: result?.rows ?? [], total: result?.total ?? 0, page, pageSize, summary, matrix: result?.matrix ?? {}, period, xyzWindow: period === 'all' ? '365d' : period })
  } catch (e) {
    logApiError('[admin/analytics/abc GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
