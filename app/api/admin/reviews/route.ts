import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getAllReviews, type ReviewModerationStatus } from '@/lib/reviews-data-store'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

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

export async function PATCH(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await req.json()) as { id?: string; ids?: string[]; status?: ReviewModerationStatus; reply?: string | null }
    const id = body.id?.trim()

    // Handle admin reply (set or clear)
    if ('reply' in body) {
      if (!id) return errorResponse('Review id is required', 400)
      const changed = await prisma.$transaction(async (tx) => {
        const before = await tx.review.findUnique({ where: { id } })
        if (!before) return false
        const after = await tx.review.update({ where: { id }, data: {
          adminReply: body.reply ? { text: body.reply.trim(), repliedAt: new Date().toISOString() } : Prisma.DbNull,
        } })
        await appendServerAudit(tx, req, actor, { action: body.reply ? 'review.reply_saved' : 'review.reply_deleted', entityType: 'review', entityId: id, before, after })
        return true
      })
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
    const updatedCount = await prisma.$transaction(async (tx) => {
      let count = 0
      const productIds = new Set<string>()
      for (const reviewId of targetIds) {
        const before = await tx.review.findUnique({ where: { id: reviewId } })
        if (!before) continue
        const after = await tx.review.update({ where: { id: reviewId }, data: { status } })
        productIds.add(before.productId); count += 1
        await appendServerAudit(tx, req, actor, { action: 'review.status_changed', entityType: 'review', entityId: reviewId, before, after })
      }
      for (const productId of productIds) {
        const aggregate = await tx.review.aggregate({ where: { productId, status: 'approved' }, _avg: { rating: true }, _count: true })
        await tx.product.updateMany({ where: { id: productId }, data: { rating: aggregate._avg.rating ?? 0, ratingCount: aggregate._count, reviewCount: aggregate._count } })
      }
      return count
    })

    if (updatedCount === 0) {
      return errorResponse('Reviews not found', 404)
    }

    return successResponse({ ids: targetIds, status, updatedCount })
  } catch (error) {
    console.error('Admin reviews PATCH error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await req.json()) as { id?: string; ids?: string[] }
    const id = body.id?.trim()
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => item.trim()).filter(Boolean) : []

    if (!id && ids.length === 0) {
      return errorResponse('Review id or ids are required', 400)
    }

    const targetIds = ids.length > 0 ? ids : [id as string]
    const deletedCount = await prisma.$transaction(async (tx) => {
      let count = 0
      const productIds = new Set<string>()
      for (const reviewId of targetIds) {
        const before = await tx.review.findUnique({ where: { id: reviewId } })
        if (!before) continue
        await tx.review.delete({ where: { id: reviewId } }); productIds.add(before.productId); count += 1
        await appendServerAudit(tx, req, actor, { action: 'review.deleted', entityType: 'review', entityId: reviewId, before })
      }
      for (const productId of productIds) {
        const aggregate = await tx.review.aggregate({ where: { productId, status: 'approved' }, _avg: { rating: true }, _count: true })
        await tx.product.updateMany({ where: { id: productId }, data: { rating: aggregate._avg.rating ?? 0, ratingCount: aggregate._count, reviewCount: aggregate._count } })
      }
      return count
    })

    if (deletedCount === 0) {
      return errorResponse('Reviews not found', 404)
    }

    return successResponse({ ids: targetIds, deletedCount })
  } catch (error) {
    console.error('Admin reviews DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
