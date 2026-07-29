import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getDeletedProductsArchive, purgeDeletedProductArchive } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const archive = await getDeletedProductsArchive()
    return successResponse({ archive })
  } catch (error) {
    console.error('Admin products archive GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await req.json()) as { id?: string }
    const id = body.id?.trim()

    if (!id) {
      return errorResponse('Product id is required', 400)
    }

    const result = await purgeDeletedProductArchive(id)
    if (!result.success) {
      return errorResponse(result.error, 400)
    }

    return successResponse({ archive: result.archive })
  } catch (error) {
    console.error('Admin products archive DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
