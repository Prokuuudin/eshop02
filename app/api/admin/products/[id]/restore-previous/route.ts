import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import type { Product } from '@/data/products'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { applyProductOverride, type ProductOverride } from '@/lib/product-overrides-store'
import { mapDbToProduct, mapProductToDbCreate } from '@/lib/product-overrides-mapping'
import { productChangesSchema } from '@/lib/product-mutation-schema'
import { ProductMutationError, assertReferences, assertUniqueSku } from '@/lib/product-mutation'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }
type RequestBody = { revision?: number }

function readProductSnapshot(value: unknown, id: string): Product | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const allowed = Object.keys(productChangesSchema.shape)
  const candidate = Object.fromEntries(allowed.filter((key) => key in source).map((key) => [key, source[key]]))
  const parsed = productChangesSchema.safeParse(candidate)
  return parsed.success ? { id, ...parsed.data } as Product : null
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor

  try {
    const { id: rawId } = await context.params
    const id = rawId.trim()
    const body = await request.json() as RequestBody
    if (!id || !Number.isInteger(body.revision) || (body.revision ?? 0) < 1) {
      return errorResponse('Invalid request', 400)
    }

    const restored = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id } })
      if (!current || current.isDeleted) throw new ProductMutationError('Product not found', 404)
      if (current.revision !== body.revision) {
        throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
      }

      const history = await tx.auditLog.findMany({
        where: { entityType: 'product', entityId: id, action: { in: ['product.update', 'product.restore_previous'] } },
        orderBy: { at: 'desc' },
        take: 20,
        select: { before: true },
      })
      const snapshot = history.map((entry) => readProductSnapshot(entry.before, id)).find(Boolean)
      if (!snapshot) throw new ProductMutationError('Previous product version not found', 404)

      const setting = await tx.keyValueSetting.findUnique({ where: { key: 'product-overrides' } })
      const overrides = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
        ? setting.value as Record<string, ProductOverride> : {}
      const before = applyProductOverride(mapDbToProduct(current), overrides[id])
      const nextProduct = current.externalId ? { ...snapshot, stock: current.stock } : snapshot

      await assertReferences(tx, id, nextProduct.relatedProductIds, nextProduct.oftenBoughtTogether)
      await assertUniqueSku(tx, id, nextProduct.sku)
      const mapped = mapProductToDbCreate(nextProduct, current.isCustom)
      const { id: _id, isCustom: _custom, isDeleted: _deleted, ...data } = mapped
      const result = await tx.product.updateMany({
        where: { id, revision: body.revision },
        data: { ...data, revision: { increment: 1 } },
      })
      if (result.count !== 1) throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)

      if (overrides[id]) {
        delete overrides[id]
        await tx.keyValueSetting.update({
          where: { key: 'product-overrides' },
          data: { value: overrides as Prisma.InputJsonValue },
        })
      }

      const next = await tx.product.findUniqueOrThrow({ where: { id } })
      await appendServerAudit(tx, request, actor, {
        action: 'product.restore_previous', entityType: 'product', entityId: id,
        entityTitle: next.title, before, after: mapDbToProduct(next),
      })
      return next
    })

    return successResponse({ product: mapDbToProduct(restored) })
  } catch (error) {
    if (error instanceof ProductMutationError) return errorResponse(error.message, error.status)
    logApiError('Admin product restore previous error:', error)
    return errorResponse('Failed to restore previous product version', 500)
  }
}
