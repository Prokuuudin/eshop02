import { NextRequest } from 'next/server'
import { logApiError } from '@/lib/observability'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getDbProductsPaginated } from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { redactProductPrices } from '@/lib/product-price-visibility'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const canSeePrices = Boolean(await getServerUser())
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') ?? undefined
    const rawSkip = Number(searchParams.get('skip') ?? '0')
    const rawTake = Number(searchParams.get('take') ?? '50')
    if (!Number.isInteger(rawSkip) || rawSkip < 0 || !Number.isInteger(rawTake) || rawTake < 1 || rawTake > 200) {
      return errorResponse('Invalid pagination', 400)
    }
    const result = await getDbProductsPaginated({ category, skip: rawSkip, take: rawTake })
    return successResponse(canSeePrices ? result : redactProductPrices(result))
  } catch (error) {
    logApiError("Public products GET error:", error)
    return errorResponse('Internal server error', 500)
  }
}


