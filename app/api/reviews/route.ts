import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { createReview, getProductPublicReviews, getProductReviewStats } from '@/lib/reviews-data-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const productId = searchParams.get('productId')?.trim()

    if (!productId) {
      return errorResponse('Product id is required', 400)
    }

    const [reviews, stats] = await Promise.all([
      getProductPublicReviews(productId),
      getProductReviewStats(productId)
    ])

    return successResponse({ reviews, stats })
  } catch (error) {
    console.error('Reviews GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      productId?: string
      author?: string
      rating?: number
      title?: string
      text?: string
    }

    const productId = body.productId?.trim()
    const author = body.author?.trim() || 'Anonymous'
    const title = body.title?.trim()
    const text = body.text?.trim()
    const rating = Number(body.rating)

    if (!productId) {
      return errorResponse('Product id is required', 400)
    }
    if (!title || !text) {
      return errorResponse('Title and text are required', 400)
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return errorResponse('Rating must be a number from 1 to 5', 400)
    }

    const review = await createReview({
      productId,
      author,
      rating,
      title,
      text
    })

    return successResponse({ review }, 201)
  } catch (error) {
    console.error('Reviews POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}
