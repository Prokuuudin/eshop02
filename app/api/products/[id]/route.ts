import { NextResponse } from 'next/server'
import { getMergedProducts } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const products = await getMergedProducts()
  const product = products.find((p) => p.id === id)

  if (!product) {
    return NextResponse.json({ product: null }, { status: 404 })
  }

  return NextResponse.json({ product })
}
