import { NextResponse } from 'next/server'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { prisma } from '@/lib/prisma'
import { brandSlug } from '@/lib/brand-slug'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getBrandsConfigFromStore()

  const activeProducts = await prisma.product.findMany({
    where: { isDeleted: false, isActive: true },
    select: { brand: true },
    distinct: ['brand'],
  })
  const activeBrandIds = new Set(activeProducts.map((p) => brandSlug(p.brand)))

  return NextResponse.json({
    brands: config.brands.filter((b) => b.isDistributor || activeBrandIds.has(b.id)),
  })
}
