import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

const PERIOD_DAYS: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null }

type TotalsRow = { totalWithPromo: number; totalOrders: number; totalDiscounts: number; promoRevenue: number; avgDiscountPercent: number }
type CodeRow = { code: string; count: number; totalDiscount: number; revenue: number; avgOrder: number }
type CategoryRow = { cat: string; count: number; totalDiscount: number }
type RecentRow = { id: string; email: string; promoCode: string; discount: number; total: number; createdAt: Date }

/** Marketing figures include non-cancelled orders only. Missing status records are treated as pending. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const requestedPeriod = req.nextUrl.searchParams.get('period') ?? '30d'
    const period = requestedPeriod in PERIOD_DAYS ? requestedPeriod : '30d'
    const days = PERIOD_DAYS[period]
    const cutoff = days == null ? null : new Date(Date.now() - days * 86_400_000)
    const dateAnd = cutoff ? Prisma.sql`AND o."createdAt" >= ${cutoff}` : Prisma.empty
    const validOrderAnd = Prisma.sql`AND COALESCE(os.status, 'pending') <> 'cancelled'`

    const [totalsRows, codeRows, categoryRows, recentRows] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*) FILTER (WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL)::int AS "totalWithPromo",
          COUNT(*)::int AS "totalOrders",
          COALESCE(SUM(o.discount) FILTER (WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL), 0)::float8 AS "totalDiscounts",
          COALESCE(SUM(o.total) FILTER (WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL), 0)::float8 AS "promoRevenue",
          COALESCE(AVG(CASE WHEN o.subtotal > 0 THEN (o.discount / o.subtotal) * 100 END)
            FILTER (WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL), 0)::float8 AS "avgDiscountPercent"
        FROM "Order" o LEFT JOIN "OrderStatusRecord" os ON os."orderId" = o.id
        WHERE true ${validOrderAnd} ${dateAnd}
      `,
      prisma.$queryRaw<CodeRow[]>`
        SELECT UPPER(trim(o."promoCode")) AS code, COUNT(*)::int AS count,
          COALESCE(SUM(o.discount), 0)::float8 AS "totalDiscount",
          COALESCE(SUM(o.total), 0)::float8 AS revenue,
          COALESCE(AVG(o.total), 0)::float8 AS "avgOrder"
        FROM "Order" o LEFT JOIN "OrderStatusRecord" os ON os."orderId" = o.id
        WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL ${validOrderAnd} ${dateAnd}
        GROUP BY UPPER(trim(o."promoCode")) ORDER BY revenue DESC
      `,
      prisma.$queryRaw<CategoryRow[]>`
        SELECT COALESCE(NULLIF(item->>'category', ''), 'unknown') AS cat,
          SUM(COALESCE((item->>'quantity')::int, 1))::int AS count,
          COALESCE(SUM(o.discount * (COALESCE((item->>'price')::numeric, 0) * COALESCE((item->>'quantity')::numeric, 1)) /
            NULLIF(lines.items_subtotal, 0)), 0)::float8 AS "totalDiscount"
        FROM "Order" o LEFT JOIN "OrderStatusRecord" os ON os."orderId" = o.id
        CROSS JOIN LATERAL jsonb_array_elements(o.items::jsonb) AS item
        CROSS JOIN LATERAL (SELECT SUM(COALESCE((i->>'price')::numeric, 0) * COALESCE((i->>'quantity')::numeric, 1)) AS items_subtotal FROM jsonb_array_elements(o.items::jsonb) AS i) lines
        WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL ${validOrderAnd} ${dateAnd}
        GROUP BY cat ORDER BY count DESC
      `,
      prisma.$queryRaw<RecentRow[]>`
        SELECT o.id, o.email, UPPER(trim(o."promoCode")) AS "promoCode", o.discount::float8 AS discount,
          o.total::float8 AS total, o."createdAt"
        FROM "Order" o LEFT JOIN "OrderStatusRecord" os ON os."orderId" = o.id
        WHERE NULLIF(trim(o."promoCode"), '') IS NOT NULL ${validOrderAnd} ${dateAnd}
        ORDER BY o."createdAt" DESC LIMIT 20
      `,
    ])

    const totals = totalsRows[0] ?? { totalWithPromo: 0, totalOrders: 0, totalDiscounts: 0, promoRevenue: 0, avgDiscountPercent: 0 }
    return NextResponse.json({
      period, ...totals,
      promoOrderShare: totals.totalOrders > 0 ? (totals.totalWithPromo / totals.totalOrders) * 100 : 0,
      discountToRevenue: totals.promoRevenue > 0 ? (totals.totalDiscounts / totals.promoRevenue) * 100 : 0,
      codeStats: codeRows,
      categoryStats: categoryRows,
      recentPromoOrders: recentRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    })
  } catch (e) {
    logApiError('[admin/marketing/analytics GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
