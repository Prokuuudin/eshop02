import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { mapDbToProduct } from '@/lib/product-overrides-mapping'
import { ProductMutationError } from '@/lib/product-mutation'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'
import { sameMoney } from '@/lib/product-sellability'
import { getVariantGroups } from '@/lib/product-variants'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

// Decimal (raw client) or number (money extension) — both stringify to the exact value.
const priceOf = (value: unknown): number => Number(String(value))

const bodySchema = z.object({
  approved: z.boolean(),
  revision: z.number().int().positive(),
  /** The Product.price the admin saw and approves; approval never covers another value. */
  expectedPrice: z.number().nonnegative().max(99_999_999.99).optional(),
}).strict().refine((body) => !body.approved || body.expectedPrice !== undefined, { message: 'expectedPrice is required to approve' })

/**
 * Explicit admin decision to sell an ERP-linked product at its local Product.price while
 * the ERP has no B2B price for it (erpPriceMissing). Editing the price never implies this
 * approval; FULL sync consumes it once ERP supplies a price again.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const actor = await requireAdminPermission('prices.update')
  if (actor instanceof NextResponse) return actor

  try {
    const { id: rawId } = await context.params
    const id = rawId.trim()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!id || !parsed.success) return errorResponse('Invalid request', 400)
    const { approved, revision, expectedPrice } = parsed.data

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id } })
      if (!current || current.isDeleted) throw new ProductMutationError('Product not found', 404)
      if (current.revision !== revision) {
        throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
      }
      if (approved && (!current.externalId || !current.erpPriceMissing)) {
        throw new ProductMutationError('Manual price approval applies only to ERP products without an ERP B2B price', 400)
      }
      if (approved && !(priceOf(current.price) > 0)) {
        throw new ProductMutationError('Set a positive local price before approving it', 400)
      }
      if (approved && !sameMoney(current.price, expectedPrice)) {
        throw new ProductMutationError('Product price changed. Reload and review the price before approving it.', 409)
      }
      // Checkout charges the base price only; a variant surcharge would make the shown and
      // charged price differ, so such products cannot run on a manual price.
      const variantSurcharge = (getVariantGroups({ technicalSpecs: current.technicalSpecs as Record<string, string> | null }) ?? [])
        .some((group) => group.options.some((option) => (option.priceAdjustment ?? 0) !== 0))
      if (approved && variantSurcharge) {
        throw new ProductMutationError('Products with variant price adjustments cannot use a manual price', 400)
      }
      const alreadyInState = approved
        ? current.manualPriceApproved && sameMoney(current.manualApprovedPrice, current.price)
        : !current.manualPriceApproved && current.manualApprovedPrice === null
      if (alreadyInState) return current

      const result = await tx.product.updateMany({
        where: { id, revision, price: current.price },
        data: {
          manualPriceApproved: approved,
          manualApprovedPrice: approved ? current.price : null,
          revision: { increment: 1 },
        },
      })
      if (result.count !== 1) {
        throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
      }
      const next = await tx.product.findUniqueOrThrow({ where: { id } })
      await appendServerAudit(tx, request, actor, {
        action: approved ? 'product.manual_price_approved' : 'product.manual_price_revoked',
        entityType: 'product',
        entityId: id,
        entityTitle: next.title,
        before: { manualPriceApproved: current.manualPriceApproved, manualApprovedPrice: current.manualApprovedPrice === null ? null : priceOf(current.manualApprovedPrice), erpPriceMissing: current.erpPriceMissing, price: priceOf(current.price), externalId: current.externalId },
        after: { manualPriceApproved: next.manualPriceApproved, manualApprovedPrice: next.manualApprovedPrice === null ? null : priceOf(next.manualApprovedPrice), erpPriceMissing: next.erpPriceMissing, price: priceOf(next.price), externalId: next.externalId },
        details: approved
          ? `ERP B2B price missing; local price ${priceOf(next.price).toFixed(2)} € approved for sale`
          : 'Manual local price approval revoked',
      })
      return next
    })

    revalidateTag('storefront-bestsellers', { expire: 0 })
    revalidateTag('storefront-sale-products', { expire: 0 })
    return successResponse({ product: mapDbToProduct(updated) })
  } catch (error) {
    if (error instanceof ProductMutationError) return errorResponse(error.message, error.status)
    logApiError('[admin/products manual-price-approval POST]', error)
    return errorResponse('Internal server error', 500)
  }
}
