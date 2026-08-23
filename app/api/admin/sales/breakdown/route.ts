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

type TotalsRow = { orderCount: number; totalRevenue: number }
type ItemTotalsRow = { totalQty: number; uniqueProducts: number }
type ProductRow = { id: string; title: string; brand: string; qty: number; revenue: number }
type BrandRow = { brand: string; qty: number; revenue: number }
type CategoryRow = { cat: string; qty: number; revenue: number }
type TrendRow = { month: Date; cat: string; qty: number; revenue: number }

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment. This page additionally needs a revenue AND qty
// ranking for products/brands (the UI toggles between them without
// refetching), so those two are fetched as separate top-N queries instead of
// re-sorting one list.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const periodParam = req.nextUrl.searchParams.get('period') ?? '30d'
    const days = periodParam in PERIOD_DAYS ? PERIOD_DAYS[periodParam] : 30
    const cutoff = days != null ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null

    const dateWhere = cutoff ? Prisma.sql`WHERE o."createdAt" >= ${cutoff}` : Prisma.empty
    const dateAnd = cutoff ? Prisma.sql`AND o."createdAt" >= ${cutoff}` : Prisma.empty

    const [
      totalsRows,
      itemTotalsRows,
      productsByRevenue,
      productsByQty,
      brandsByRevenue,
      brandsByQty,
      categoryRows,
      trendRows,
    ] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(o.total), 0)::float8 AS "totalRevenue"
        FROM "Order" o
        ${dateWhere}
      `,
      prisma.$queryRaw<ItemTotalsRow[]>`
        SELECT
          COALESCE(SUM((item->>'quantity')::int), 0)::int AS "totalQty",
          COUNT(DISTINCT item->>'id')::int AS "uniqueProducts"
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
      `,
      prisma.$queryRaw<ProductRow[]>`
        SELECT
          item->>'id' AS id,
          MAX(item->>'title') AS title,
          MAX(COALESCE(item->>'brand', '—')) AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL ${dateAnd}
        GROUP BY item->>'id'
        ORDER BY revenue DESC
        LIMIT 10
      `,
      prisma.$queryRaw<ProductRow[]>`
        SELECT
          item->>'id' AS id,
          MAX(item->>'title') AS title,
          MAX(COALESCE(item->>'brand', '—')) AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE item->>'id' IS NOT NULL ${dateAnd}
        GROUP BY item->>'id'
        ORDER BY qty DESC
        LIMIT 10
      `,
      prisma.$queryRaw<BrandRow[]>`
        SELECT
          COALESCE(item->>'brand', '—') AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
        GROUP BY brand
        ORDER BY revenue DESC
        LIMIT 15
      `,
      prisma.$queryRaw<BrandRow[]>`
        SELECT
          COALESCE(item->>'brand', '—') AS brand,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
        GROUP BY brand
        ORDER BY qty DESC
        LIMIT 15
      `,
      prisma.$queryRaw<CategoryRow[]>`
        SELECT
          COALESCE(item->>'category', 'other') AS cat,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
        GROUP BY cat
        ORDER BY revenue DESC
      `,
      prisma.$queryRaw<TrendRow[]>`
        SELECT
          date_trunc('month', o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Riga')::date AS month,
          COALESCE(item->>'category', 'other') AS cat,
          SUM((item->>'quantity')::int)::int AS qty,
          SUM((item->>'quantity')::numeric * (item->>'price')::numeric)::float8 AS revenue
        FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
        WHERE true ${dateAnd}
        GROUP BY month, cat
        ORDER BY month
      `,
    ])

    const totals = totalsRows[0] ?? { orderCount: 0, totalRevenue: 0 }
    const itemTotals = itemTotalsRows[0] ?? { totalQty: 0, uniqueProducts: 0 }
    const toProduct = (row: ProductRow) => ({ id: row.id, title: row.title, brand: row.brand, qty: row.qty, revenue: row.revenue })
    const toBrand = (row: BrandRow) => ({ brand: row.brand, qty: row.qty, revenue: row.revenue })

    return NextResponse.json({
      orderCount: totals.orderCount,
      totalRevenue: totals.totalRevenue,
      totalQty: itemTotals.totalQty,
      uniqueProducts: itemTotals.uniqueProducts,
      topProductsByRevenue: productsByRevenue.map(toProduct),
      topProductsByQty: productsByQty.map(toProduct),
      topBrandsByRevenue: brandsByRevenue.map(toBrand),
      topBrandsByQty: brandsByQty.map(toBrand),
      categorySummary: categoryRows.map((row) => ({ cat: row.cat, qty: row.qty, revenue: row.revenue })),
      categoryTrend: trendRows.map((row) => ({
        month: row.month instanceof Date ? row.month.toISOString().slice(0, 7) : String(row.month).slice(0, 7),
        cat: row.cat,
        qty: row.qty,
        revenue: row.revenue,
      })),
    })
  } catch (e) {
    logApiError('[admin/sales/breakdown GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
