import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getMergedProducts, getDbProductsPaginated } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') ?? undefined
    const skipParam = searchParams.get('skip')
    const takeParam = searchParams.get('take')

    if (skipParam !== null || takeParam !== null) {
      const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : undefined
      const take = takeParam ? Math.min(200, Math.max(1, parseInt(takeParam, 10))) : undefined
      const result = await getDbProductsPaginated({ category, skip, take })
      return successResponse(result)
    }

    const products = await getMergedProducts()
    const filtered = category ? products.filter((p) => p.category === category) : products
    return successResponse({ products: filtered })
  } catch (error) {
    console.error('Public products GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
