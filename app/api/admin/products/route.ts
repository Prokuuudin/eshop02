import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { Prisma } from '@/generated/prisma/client'
import { requireAdminPermission } from '@/lib/server-auth'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { deleteProductAny, getAdminProducts, getAdminProductsPaginated, resetProductOverride } from '@/lib/product-overrides-store'
import { mapDbToProduct, mapProductToDbCreate } from '@/lib/product-overrides-mapping'
import { createProductRequestSchema, updateProductRequestSchema } from '@/lib/product-mutation-schema'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { notifyPriceChange, notifyRestock } from '@/lib/product-news-notify'
import { toNum } from '@/lib/decimal'
import { ProductMutationError, applyProductChanges, assertReferences, assertUniqueSku } from '@/lib/product-mutation'

export const runtime = 'nodejs'

function mutationError(error: unknown): Response | null {
  if (error instanceof ProductMutationError) return errorResponse(error.message, error.status)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return errorResponse('SKU or product ID already exists', 409)
  return null
}

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAdminPermission('catalog.read')
  if (gate instanceof NextResponse) return gate
  try {
    const pageParam = req.nextUrl.searchParams.get('page')
    const limitParam = req.nextUrl.searchParams.get('limit')
    if (!pageParam && !limitParam && !req.nextUrl.searchParams.has('q')) {
      return successResponse({ products: await getAdminProducts() })
    }
    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitParam ?? '24', 10) || 24))
    const result = await getAdminProductsPaginated({
      search: req.nextUrl.searchParams.get('q') ?? undefined,
      category: req.nextUrl.searchParams.get('category') ?? undefined,
      skip: (page - 1) * limit,
      take: limit,
    })
    return successResponse({ ...result, page, limit, hasMore: page * limit < result.total })
  }
  catch (error) { logApiError("Admin products GET error:", error); return errorResponse('Internal server error', 500) }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const parsed = updateProductRequestSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_product', issues: parsed.error.flatten() }, { status: 400 })
    const { id, revision, changes } = parsed.data
    let priceChange: { oldPrice: number; newPrice: number } | null = null
    let restocked = false
    const updated = await prisma.$transaction(async (tx) => {
      const { before, next } = await applyProductChanges(tx, id, revision, changes)
      await appendServerAudit(tx, req, actor, { action: 'product.update', entityType: 'product', entityId: id, entityTitle: next.title, before, after: mapDbToProduct(next) })
      if (before.price !== toNum(next.price)) priceChange = { oldPrice: before.price, newPrice: toNum(next.price) }
      if (before.stock === 0 && next.stock > 0) restocked = true
      return next
    })
    if (priceChange) {
      // TS narrows `priceChange` to `null` here despite the transaction closure's
      // reassignment (control-flow analysis doesn't see across function boundaries) —
      // assert back to the declared type; runtime `if (priceChange)` check is unaffected.
      const change = priceChange as { oldPrice: number; newPrice: number }
      notifyPriceChange(id, updated.title, change.oldPrice, change.newPrice)
        .catch((e) => logApiError('[admin/products PUT notifyPriceChange]', e))
    }
    if (restocked) {
      notifyRestock(id, updated.title).catch((e) => logApiError('[admin/products PUT notifyRestock]', e))
    }
    return successResponse({ product: mapDbToProduct(updated) })
  } catch (error) {
    const response = mutationError(error); if (response) return response
    logApiError("Admin products PUT error:", error); return errorResponse('Internal server error', 500)
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const parsed = createProductRequestSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_product', issues: parsed.error.flatten() }, { status: 400 })
    const product = { rating: 0, image: '', ...parsed.data.product }
    const created = await prisma.$transaction(async (tx) => {
      await assertReferences(tx, product.id, product.relatedProductIds, product.oftenBoughtTogether)
      await assertUniqueSku(tx, product.id, product.sku)
      const row = await tx.product.create({ data: mapProductToDbCreate(product, true) })
      await appendServerAudit(tx, req, actor, { action: 'product.create', entityType: 'product', entityId: row.id, entityTitle: row.title, after: mapDbToProduct(row) })
      return row
    })
    return successResponse({ product: mapDbToProduct(created) })
  } catch (error) {
    const response = mutationError(error); if (response) return response
    logApiError("Admin products POST error:", error); return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const gate = await requireAdminPermission('catalog.update')
  if (gate instanceof NextResponse) return gate
  try {
    const body = (await req.json()) as { id?: string; permanently?: boolean }
    const id = body.id?.trim()
    if (!id) return errorResponse('Product id is required', 400)
    const result = body.permanently === true ? await deleteProductAny(id) : await resetProductOverride(id)
    if (!result.success) return errorResponse(result.error, 400)
    return successResponse({ products: result.products })
  } catch (error) { logApiError("Admin products DELETE error:", error); return errorResponse('Internal server error', 500) }
}
