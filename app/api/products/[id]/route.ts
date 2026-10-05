import { NextResponse } from 'next/server'
import { getMergedProductById } from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const product = await getMergedProductById(id)

  if (!product) {
    return NextResponse.json({ product: null }, { status: 404 })
  }

  const canSeePrices = Boolean(await getServerUser())
  return NextResponse.json({
    product: canSeePrices ? product : redactProductPrices(product),
  })
}
