import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { markReviewHelpful } from '@/lib/reviews-data-store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string }
    const id = body.id?.trim()

    if (!id) {
      return errorResponse('Review id is required', 400)
    }

    const changed = await markReviewHelpful(id)
    if (!changed) {
      return errorResponse('Review not found', 404)
    }

    return successResponse({ id })
  } catch (error) {
    console.error('Review helpful POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}
