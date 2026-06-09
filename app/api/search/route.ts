import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q')?.trim() || ''
    const take = Math.min(parseInt(req.nextUrl.searchParams.get('take') || '20', 10), 50)
    const category = req.nextUrl.searchParams.get('category') || ''

    if (!query || query.length < 2) {
      return NextResponse.json({ products: [] })
    }

    type ProductRow = {
      id: string
      title: string
      brand: string
      price: number
      image: string | null
      category: string
      stock: number
      similarity: number
    }

    const whereCategory = category ? `AND "category" = $3` : ''
    const params: (string | number)[] = [query, take]
    if (category) params.push(category)

    const results = await prisma.$queryRawUnsafe<ProductRow[]>(
      `SELECT id, title, brand, price, image, category, stock,
              similarity(
                COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(sku,''),
                $1
              ) AS similarity
       FROM "Product"
       WHERE "isDeleted" = false
         AND "isActive" = true
         AND similarity(
               COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(sku,''),
               $1
             ) > 0.1
         ${whereCategory}
       ORDER BY similarity DESC
       LIMIT $2`,
      ...params
    )

    return NextResponse.json({ products: results })
  } catch (e) {
    console.error('[api/search]', e)
    return NextResponse.json({ products: [] })
  }
}
