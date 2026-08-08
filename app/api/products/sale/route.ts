import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { mapDbToProduct } from '@/lib/product-overrides-store'
import { isProductOnSale } from '@/data/products'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const dbProducts = await prisma.product.findMany({
      where: { isActive: true, image: { not: null }, oldPrice: { not: null } },
    })

    const products = dbProducts
      .map(mapDbToProduct)
      .filter(isProductOnSale)
      .sort((a, b) => {
        const discountA = a.oldPrice ? (a.oldPrice - a.price) / a.oldPrice : 0
        const discountB = b.oldPrice ? (b.oldPrice - b.price) / b.oldPrice : 0
        return discountB - discountA
      })
      .slice(0, 24)

    const canSeePrices = Boolean(await getServerUser())
    return NextResponse.json({
      products: canSeePrices ? products : redactProductPrices(products),
    })
  } catch (err) {
    logApiError("sale products error", err)
    return NextResponse.json({ products: [] })
  }
}


