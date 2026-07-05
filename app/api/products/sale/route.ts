import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapDbToProduct } from '@/lib/product-overrides-store'
import { isProductOnSale } from '@/data/products'

export const runtime = 'nodejs'

export async function GET() {
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

    return NextResponse.json({ products })
  } catch (err) {
    console.error('sale products error', err)
    return NextResponse.json({ products: [] })
  }
}
