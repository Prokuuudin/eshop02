import { NextRequest } from 'next/server'
import { logApiError } from '@/lib/observability'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { createReview, getProductPublicReviews, getProductReviewStats } from '@/lib/reviews-data-store'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const REVIEW_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 3 }
const clientIp = (req: NextRequest) =>
  req.headers.get('cf-connecting-ip')?.trim()
  || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || req.headers.get('x-real-ip')?.trim()
  || 'unknown'

export async function GET(req: NextRequest): Promise<Response> {
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
    logApiError("Reviews GET error:", error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 16_384) return errorResponse('Payload too large', 413)

    const sessionUser = await getServerUser()
    const identity = sessionUser ? `user:${sessionUser.id}` : `ip:${clientIp(req)}`
    const limit = await checkRateLimit(`review-create:${identity}`, REVIEW_LIMIT)
    if (limit.limited) {
      return new Response(JSON.stringify({ error: 'rate_limited', resetAt: limit.resetAt }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) },
      })
    }

    const body = (await req.json()) as {
      productId?: string
      author?: string
      rating?: number
      title?: string
      text?: string
    }

    const productId = body.productId?.trim()
    // Автор из сессии, если юзер залогинен — по этому имени /api/reviews/my
    // находит отзывы в кабинете (у Review нет userId)
    const author = sessionUser?.name?.trim() || body.author?.trim() || 'Anonymous'
    const title = body.title?.trim()
    const text = body.text?.trim()
    const rating = Number(body.rating)

    if (!productId) {
      return errorResponse('Product id is required', 400)
    }
    if (productId.length > 128 || author.length > 100 || title!.length > 150 || text!.length > 5000) {
      return errorResponse('Field too long', 400)
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

    if (Math.random() < 0.01) void gcRateLimitStore()

    return successResponse({ review }, 201)
  } catch (error) {
    logApiError("Reviews POST error:", error)
    return errorResponse('Internal server error', 500)
  }
}





