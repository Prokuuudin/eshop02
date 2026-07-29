import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toNum } from '@/lib/decimal'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerUser } from '@/lib/server-auth'

const SEARCH_LIMIT = { windowMs: 60 * 1000, maxAttempts: 30 }
const MAX_QUERY_LENGTH = 160
const MAX_CATEGORY_LENGTH = 100

function getClientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const query = req.nextUrl.searchParams.get('q')?.trim() || ''
    const rawTake = req.nextUrl.searchParams.get('take') ?? '20'
    const take = Number(rawTake)
    const category = req.nextUrl.searchParams.get('category') || ''

    if (!query || query.length < 2) {
      return NextResponse.json({ products: [] })
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: 'query_too_long', products: [] }, { status: 400 })
    }
    if (!Number.isInteger(take) || take < 1 || take > 50) {
      return NextResponse.json({ error: 'invalid_take', products: [] }, { status: 400 })
    }
    if (category.length > MAX_CATEGORY_LENGTH) {
      return NextResponse.json({ error: 'invalid_category', products: [] }, { status: 400 })
    }

    const limit = await checkRateLimit(`search:ip:${getClientIp(req)}`, SEARCH_LIMIT)
    if (limit.limited) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
      return NextResponse.json({ error: 'rate_limited', products: [] }, {
        status: 429, headers: { 'Retry-After': String(retryAfter) },
      })
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

    // $queryRawUnsafe bypasses the Prisma Client Extension in lib/prisma-money-extension.ts,
    // so `price` (a Decimal column) needs manual conversion back to a plain number here.
    const canSeePrices = Boolean(await getServerUser())
    const products = results.map((row) => {
      const product = { ...row, price: toNum(row.price) }
      if (canSeePrices) return product
      const { price: _price, ...publicProduct } = product
      return publicProduct
    })

    return NextResponse.json({ products })
  } catch (e) {
    console.error('[api/search]', e)
    return NextResponse.json({ products: [] })
  }
}
