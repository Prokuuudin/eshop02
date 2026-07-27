import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapDbToProduct } from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ product_id: string; total_qty: number }[]>`
      SELECT
        item->>'id'               AS product_id,
        SUM((item->>'quantity')::int) AS total_qty
      FROM "Order",
        jsonb_array_elements(items::jsonb) AS item
      WHERE item->>'id' IS NOT NULL
      GROUP BY item->>'id'
      ORDER BY total_qty DESC
      LIMIT 24
    `

    const ids = rows.map((r) => r.product_id)
    if (!ids.length) return NextResponse.json({ products: [] })

    const dbProducts = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true, image: { not: null } },
    })

    // Keep order-count ranking
    const byId = Object.fromEntries(dbProducts.map((p) => [p.id, p]))
    const products = ids
      .filter((id) => byId[id])
      .map((id) => mapDbToProduct(byId[id]))

    const visibleProducts = products.slice(0, 16)
    const canSeePrices = Boolean(await getServerUser())
    return NextResponse.json({
      products: canSeePrices ? visibleProducts : redactProductPrices(visibleProducts),
    })
  } catch (err) {
    console.error('bestsellers error', err)
    return NextResponse.json({ products: [] })
  }
}
