import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

type TotalsRow = { totalWithPromo: number; totalOrders: number; totalDiscounts: number; avgDiscount: number }
type CodeRow = { code: string; count: number; totalDiscount: number; avgOrder: number }
type CategoryRow = { cat: string; count: number; totalDiscount: number }
type RecentRow = { id: string; email: string; promoCode: string; discount: number; createdAt: Date }

// Same server-side aggregation approach as /api/admin/sales/analytics - see
// that route's comment.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const [totalsRows, codeRows, categoryRows, recentRows] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> '')::int AS "totalWithPromo",
          COUNT(*)::int AS "totalOrders",
          COALESCE(SUM(o.discount) FILTER (WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> ''), 0)::float8 AS "totalDiscounts",
          COALESCE(AVG(CASE WHEN o.subtotal > 0 THEN (o.discount / o.subtotal) * 100 ELSE 0 END)
            FILTER (WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> ''), 0)::float8 AS "avgDiscount"
        FROM "Order" o
      `,
      prisma.$queryRaw<CodeRow[]>`
        SELECT
          UPPER(o."promoCode") AS code,
          COUNT(*)::int AS count,
          COALESCE(SUM(o.discount), 0)::float8 AS "totalDiscount",
          (COALESCE(SUM(o.total), 0) / COUNT(*))::float8 AS "avgOrder"
        FROM "Order" o
        WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> ''
        GROUP BY UPPER(o."promoCode")
        ORDER BY count DESC
      `,
      prisma.$queryRaw<CategoryRow[]>`
        SELECT
          COALESCE(item->>'category', 'unknown') AS cat,
          SUM((item->>'quantity')::int)::int AS count,
          SUM((o.discount / NULLIF(item_count.cnt, 0)) * (item->>'quantity')::int)::float8 AS "totalDiscount"
        FROM "Order" o
        JOIN LATERAL (SELECT jsonb_array_length(o.items::jsonb) AS cnt) item_count ON true,
          jsonb_array_elements(o.items::jsonb) AS item
        WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> ''
        GROUP BY cat
        ORDER BY count DESC
      `,
      prisma.$queryRaw<RecentRow[]>`
        SELECT o.id, o.email, o."promoCode", o.discount::float8 AS discount, o."createdAt"
        FROM "Order" o
        WHERE o."promoCode" IS NOT NULL AND trim(o."promoCode") <> ''
        ORDER BY o."createdAt" DESC
        LIMIT 20
      `,
    ])

    const totals = totalsRows[0] ?? { totalWithPromo: 0, totalOrders: 0, totalDiscounts: 0, avgDiscount: 0 }
    const conversionRate = totals.totalOrders > 0 ? (totals.totalWithPromo / totals.totalOrders) * 100 : 0

    return NextResponse.json({
      totalWithPromo: totals.totalWithPromo,
      totalOrders: totals.totalOrders,
      totalDiscounts: totals.totalDiscounts,
      avgDiscount: totals.avgDiscount,
      conversionRate,
      codeStats: codeRows.map((row) => ({ code: row.code, count: row.count, totalDiscount: row.totalDiscount, avgOrder: row.avgOrder })),
      categoryStats: categoryRows.map((row) => ({ cat: row.cat, count: row.count, totalDiscount: row.totalDiscount })),
      recentPromoOrders: recentRows.map((row) => ({
        id: row.id,
        email: row.email,
        promoCode: row.promoCode,
        discount: row.discount,
        createdAt: row.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    logApiError('[admin/marketing/analytics GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
