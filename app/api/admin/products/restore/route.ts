import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getDeletedProductsArchive, restoreDeletedProduct } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await req.json()) as { id?: string }
    const id = body.id?.trim()

    if (!id) {
      return errorResponse('Product id is required', 400)
    }

    const result = await restoreDeletedProduct(id)
    if (!result.success) {
      return errorResponse(result.error, 400)
    }

    const archive = await getDeletedProductsArchive()
    return successResponse({ products: result.products, archive })
  } catch (error) {
    console.error('Admin products restore POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}
