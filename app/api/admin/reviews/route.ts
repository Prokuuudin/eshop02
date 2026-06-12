import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { deleteAdminReply, deleteReview, getAllReviews, setAdminReply, type ReviewModerationStatus, updateReviewStatus } from '@/lib/reviews-data-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { searchParams } = new URL(req.url)
    const productId = searchParams.get('productId')?.trim()
    const status = searchParams.get('status')?.trim() as ReviewModerationStatus | undefined
    const search = searchParams.get('search')?.trim().toLowerCase()

    const reviews = await getAllReviews()
    const filtered = reviews.filter((review) => {
      if (productId && review.productId !== productId) return false
      if (status && status !== 'approved' && status !== 'hidden' && status !== 'pending') return false
      if (status && review.status !== status) return false

      if (search) {
        const haystack = `${review.author} ${review.title} ${review.text} ${review.productId}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }

      return true
    })

    return successResponse({ reviews: filtered })
  } catch (error) {
    console.error('Admin reviews GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PATCH(req: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await req.json()) as { id?: string; ids?: string[]; status?: ReviewModerationStatus; reply?: string | null }
    const id = body.id?.trim()

    // Handle admin reply (set or clear)
    if ('reply' in body) {
      if (!id) return errorResponse('Review id is required', 400)
      const changed = body.reply
        ? await setAdminReply(id, body.reply.trim())
        : await deleteAdminReply(id)
      if (!changed) return errorResponse('Review not found', 404)
      return successResponse({ id, reply: body.reply ?? null })
    }

    const ids = Array.isArray(body.ids) ? body.ids.map((item) => item.trim()).filter(Boolean) : []
    const status = body.status

    if (!id && ids.length === 0) {
      return errorResponse('Review id or ids are required', 400)
    }

    if (status !== 'approved' && status !== 'hidden' && status !== 'pending') {
      return errorResponse('Status must be approved, hidden or pending', 400)
    }

    const targetIds = ids.length > 0 ? ids : [id as string]
    let updatedCount = 0

    for (const reviewId of targetIds) {
      const changed = await updateReviewStatus(reviewId, status)
      if (changed) updatedCount += 1
    }

    if (updatedCount === 0) {
      return errorResponse('Reviews not found', 404)
    }

    return successResponse({ ids: targetIds, status, updatedCount })
  } catch (error) {
    console.error('Admin reviews PATCH error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await req.json()) as { id?: string; ids?: string[] }
    const id = body.id?.trim()
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => item.trim()).filter(Boolean) : []

    if (!id && ids.length === 0) {
      return errorResponse('Review id or ids are required', 400)
    }

    const targetIds = ids.length > 0 ? ids : [id as string]
    let deletedCount = 0

    for (const reviewId of targetIds) {
      const changed = await deleteReview(reviewId)
      if (changed) deletedCount += 1
    }

    if (deletedCount === 0) {
      return errorResponse('Reviews not found', 404)
    }

    return successResponse({ ids: targetIds, deletedCount })
  } catch (error) {
    console.error('Admin reviews DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
