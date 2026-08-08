import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { Prisma } from '@/generated/prisma/client'
import { requireAdminPermission } from '@/lib/server-auth'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { applyProductOverride, deleteProductAny, getAdminProducts, resetProductOverride, type ProductOverride } from '@/lib/product-overrides-store'
import { mapDbToProduct, mapProductToDbCreate } from '@/lib/product-overrides-mapping'
import { createProductRequestSchema, updateProductRequestSchema } from '@/lib/product-mutation-schema'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

class ProductMutationError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function assertUniqueSku(tx: ExtendedTransactionClient, productId: string, sku?: string): Promise<void> {
  const normalized = sku?.trim()
  if (!normalized) return
  const duplicate = await tx.product.findFirst({ where: { sku: { equals: normalized, mode: 'insensitive' }, id: { not: productId } }, select: { id: true } })
  if (duplicate) throw new ProductMutationError('SKU already belongs to another product', 409)
}

async function assertReferences(tx: ExtendedTransactionClient, productId: string, ...lists: Array<string[] | undefined>): Promise<void> {
  const ids = [...new Set(lists.flatMap((list) => list ?? []))]
  if (ids.includes(productId)) throw new ProductMutationError('A product cannot reference itself', 400)
  if (!ids.length) return
  const found = await tx.product.count({ where: { id: { in: ids }, isDeleted: false } })
  if (found !== ids.length) throw new ProductMutationError('One or more related products do not exist', 400)
}

function mutationError(error: unknown): Response | null {
  if (error instanceof ProductMutationError) return errorResponse(error.message, error.status)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return errorResponse('SKU or product ID already exists', 409)
  return null
}

export async function GET(): Promise<Response> {
  const gate = await requireAdminPermission('catalog.read')
  if (gate instanceof NextResponse) return gate
  try { return successResponse({ products: await getAdminProducts() }) }
  catch (error) { logApiError("Admin products GET error:", error); return errorResponse('Internal server error', 500) }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const parsed = updateProductRequestSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_product', issues: parsed.error.flatten() }, { status: 400 })
    const { id, revision, changes } = parsed.data
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id } })
      if (!current || current.isDeleted) throw new ProductMutationError('Product not found', 404)
      if (current.revision !== revision) throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
      if (current.externalId && Object.hasOwn(changes, 'stock') && changes.stock !== current.stock) throw new ProductMutationError('Stock of a synchronized product cannot be changed manually', 400)
      await assertReferences(tx, id, changes.relatedProductIds, changes.oftenBoughtTogether)
      await assertUniqueSku(tx, id, changes.sku)
      const setting = await tx.keyValueSetting.findUnique({ where: { key: 'product-overrides' } })
      const overrides = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
        ? setting.value as Record<string, ProductOverride> : {}
      const before = applyProductOverride(mapDbToProduct(current), overrides[id])
      const mapped = mapProductToDbCreate({ ...before, ...changes }, current.isCustom)
      const { id: _id, isCustom: _custom, isDeleted: _deleted, ...data } = mapped
      const result = await tx.product.updateMany({ where: { id, revision }, data: { ...data, revision: { increment: 1 } } })
      if (result.count !== 1) throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
      if (overrides[id]) {
        delete overrides[id]
        await tx.keyValueSetting.update({ where: { key: 'product-overrides' }, data: { value: overrides as Prisma.InputJsonValue } })
      }
      const next = await tx.product.findUniqueOrThrow({ where: { id } })
      await appendServerAudit(tx, req, actor, { action: 'product.update', entityType: 'product', entityId: id, entityTitle: next.title, before, after: mapDbToProduct(next) })
      return next
    })
    return successResponse({ product: mapDbToProduct(updated), products: await getAdminProducts() })
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
    return successResponse({ product: mapDbToProduct(created), products: await getAdminProducts() })
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


