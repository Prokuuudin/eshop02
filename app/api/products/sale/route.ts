import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getCachedSaleProducts } from '@/lib/storefront-cache'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const products = await getCachedSaleProducts()

    const canSeePrices = Boolean(await getServerUser())
    return NextResponse.json({
      products: canSeePrices ? products : redactProductPrices(products),
    })
  } catch (err) {
    logApiError("sale products error", err)
    return NextResponse.json({ products: [] })
  }
}

