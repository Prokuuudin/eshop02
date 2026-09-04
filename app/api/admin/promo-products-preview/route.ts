import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import productSubcategories from '@/data/product-subcategories.json'

export const runtime = 'nodejs'

const SUBCATEGORY_BY_PRODUCT_ID = productSubcategories as Record<string, string>
const list = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))]
  : []

export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = await request.json() as Record<string, unknown>
    const appliesTo = ['all', 'products', 'brands', 'categories', 'rules'].includes(String(body.appliesTo))
      ? String(body.appliesTo)
      : 'all'
    const categories = appliesTo === 'categories' || appliesTo === 'rules' ? list(body.categories) : []
    const subcategories = appliesTo === 'rules' ? list(body.subcategories) : []
    const brands = appliesTo === 'brands' || appliesTo === 'rules' ? list(body.brands) : []
    const productIds = appliesTo === 'products' ? list(body.productIds) : []
    const excludedProductIds = list(body.excludedProductIds)
    const subcategoryProductIds = subcategories.length > 0
      ? Object.entries(SUBCATEGORY_BY_PRODUCT_ID).filter(([, value]) => subcategories.includes(value)).map(([id]) => id)
      : []

    if (subcategories.length > 0 && subcategoryProductIds.length === 0) {
      return NextResponse.json({ total: 0, products: [] })
    }

    const where: Prisma.ProductWhereInput = {
      isDeleted: false,
      isActive: true,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
      ...(brands.length > 0 ? { brand: { in: brands, mode: 'insensitive' } } : {}),
      ...(productIds.length > 0 ? { id: { in: productIds } } : {}),
      ...(subcategoryProductIds.length > 0 ? { AND: [{ id: { in: subcategoryProductIds } }] } : {}),
      ...(excludedProductIds.length > 0 ? { NOT: { id: { in: excludedProductIds } } } : {}),
      ...(body.excludeSaleItems === true ? { OR: [{ oldPrice: null }, { oldPrice: { lte: prisma.product.fields.price } }] } : {}),
    }
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        take: 8,
        select: { id: true, title: true, brand: true, image: true, isActive: true },
      }),
    ])
    return NextResponse.json({ total, products })
  } catch {
    return NextResponse.json({ error: 'failed_to_preview' }, { status: 400 })
  }
}
