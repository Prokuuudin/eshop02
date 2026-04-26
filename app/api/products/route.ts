import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getMergedProducts } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const products = await getMergedProducts()
    return successResponse({ products })
  } catch (error) {
    console.error('Public products GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
