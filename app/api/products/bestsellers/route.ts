import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getCachedBestsellers } from '@/lib/storefront-cache'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const visibleProducts = await getCachedBestsellers()
    const canSeePrices = Boolean(await getServerUser())
    return NextResponse.json({
      products: canSeePrices ? visibleProducts : redactProductPrices(visibleProducts),
    })
  } catch (err) {
    logApiError("bestsellers error", err)
    return NextResponse.json({ products: [] })
  }
}

