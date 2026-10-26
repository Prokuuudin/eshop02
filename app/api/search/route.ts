import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'
import { getMergedProductsByIds } from '@/lib/product-overrides-store'
import { getProductSearchIndex } from '@/lib/product-search-index'
import { matchesProductSearch, parseProductSearchQuery, rankProductSearchMatch, SEARCH_MAX_LENGTH } from '@/lib/product-search'
import type { Product } from '@/data/products'

const SEARCH_LIMIT = { windowMs: 60 * 1000, maxAttempts: 30 }
const MAX_TAKE = 10
const MAX_CATEGORY_LENGTH = 100

/** Header suggestions carry no price, stock or barcode: they render for guests and customers alike. */
export type SearchSuggestion = {
  id: string
  title: string
  brand: string
  sku?: string
  image?: string
}

function localizedTitle(product: Pick<Product, 'title' | 'titleEn' | 'titleLv'>, lang: string): string {
  if (lang === 'en' && product.titleEn) return product.titleEn
  if (lang === 'lv' && product.titleLv) return product.titleLv
  return product.title
}

/**
 * GET /api/search?q=&take=&lang=&category= — header autocomplete. Uses the same storefront index
 * (active, non-deleted products with overrides applied; cached for a minute) and the same matcher
 * as the catalog page, so a suggestion has a matching result behind "show all". Only the returned
 * suggestions are read in full, through the storefront card mapping.
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const raw = req.nextUrl.searchParams.get('q') ?? ''
    const rawTake = req.nextUrl.searchParams.get('take') ?? '6'
    const take = Number(rawTake)
    const lang = req.nextUrl.searchParams.get('lang') ?? 'ru'
    const category = req.nextUrl.searchParams.get('category') || ''

    if (raw.length > SEARCH_MAX_LENGTH) {
      return NextResponse.json({ error: 'query_too_long', products: [] }, { status: 400 })
    }
    if (!Number.isInteger(take) || take < 1 || take > MAX_TAKE) {
      return NextResponse.json({ error: 'invalid_take', products: [] }, { status: 400 })
    }
    if (category.length > MAX_CATEGORY_LENGTH) {
      return NextResponse.json({ error: 'invalid_category', products: [] }, { status: 400 })
    }
    const query = parseProductSearchQuery(raw)
    if (!query) return NextResponse.json({ products: [] })

    const limit = await checkRateLimit(`search:ip:${getClientIp(req)}`, SEARCH_LIMIT)
    if (limit.limited) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
      return NextResponse.json({ error: 'rate_limited', products: [] }, {
        status: 429, headers: { 'Retry-After': String(retryAfter) },
      })
    }

    const index = await getProductSearchIndex()
    const ids = index
      .filter((product) => (!category || product.category === category)
        && matchesProductSearch(product, query, localizedTitle(product, lang)))
      .map((product) => ({ id: product.id, score: rankProductSearchMatch(product, query, localizedTitle(product, lang)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map(({ id }) => id)

    const products: SearchSuggestion[] = (await getMergedProductsByIds(ids)).map((product) => ({
      id: product.id,
      title: localizedTitle(product, lang),
      brand: product.brand,
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.image ? { image: product.image } : {}),
    }))
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    logApiError('[api/search]', e)
    return NextResponse.json({ products: [] })
  }
}
