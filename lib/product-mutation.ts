import { Prisma } from '@/generated/prisma/client'
import { applyProductOverride, type ProductOverride } from '@/lib/product-overrides-store'
import { mapDbToProduct, mapProductToDbCreate } from '@/lib/product-overrides-mapping'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ProductChanges } from '@/lib/product-mutation-schema'
import type { Product as PrismaProduct } from '@/generated/prisma/client'
import type { Product } from '@/data/products'
import { hasSkuChanged } from '@/lib/product-sku'

export class ProductMutationError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function assertUniqueSku(tx: ExtendedTransactionClient, productId: string, sku?: string): Promise<void> {
  const normalized = sku?.trim()
  if (!normalized) return
  const duplicate = await tx.product.findFirst({ where: { sku: { equals: normalized, mode: 'insensitive' }, id: { not: productId } }, select: { id: true } })
  if (duplicate) throw new ProductMutationError('SKU already belongs to another product', 409)
}

export async function assertReferences(tx: ExtendedTransactionClient, productId: string, ...lists: Array<string[] | undefined>): Promise<void> {
  const ids = [...new Set(lists.flatMap((list) => list ?? []))]
  if (ids.includes(productId)) throw new ProductMutationError('A product cannot reference itself', 400)
  if (!ids.length) return
  const found = await tx.product.count({ where: { id: { in: ids }, isDeleted: false } })
  if (found !== ids.length) throw new ProductMutationError('One or more related products do not exist', 400)
}

/**
 * Core product update: validates, applies `changes` on top of the current row (with any
 * CMS override cleared), and bumps `revision` optimistically. Shared by the direct admin
 * PUT endpoint and the price-batch revert endpoint so both go through identical business
 * rules (stock-sync guard, SKU/reference checks, override clearing).
 */
export async function applyProductChanges(
  tx: ExtendedTransactionClient,
  id: string,
  revision: number,
  changes: Partial<Omit<ProductChanges, 'oldPrice'>> & { oldPrice?: number | null },
): Promise<{ before: Product; next: PrismaProduct }> {
  const current = await tx.product.findUnique({ where: { id } })
  if (!current || current.isDeleted) throw new ProductMutationError('Product not found', 404)
  if (current.revision !== revision) throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
  if (current.externalId && Object.hasOwn(changes, 'stock') && changes.stock !== current.stock) throw new ProductMutationError('Stock of a synchronized product cannot be changed manually', 400)
  await assertReferences(tx, id, changes.relatedProductIds, changes.oftenBoughtTogether)
  const setting = await tx.keyValueSetting.findUnique({ where: { key: 'product-overrides' } })
  const overrides = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
    ? setting.value as Record<string, ProductOverride> : {}
  const before = applyProductOverride(mapDbToProduct(current), overrides[id])
  if (Object.hasOwn(changes, 'sku') && hasSkuChanged(before.sku, changes.sku)) {
    await assertUniqueSku(tx, id, changes.sku)
  }
  const nextProduct = {
    ...before,
    ...changes,
    oldPrice: changes.oldPrice === null ? undefined : (changes.oldPrice ?? before.oldPrice),
  }
  const mapped = mapProductToDbCreate(nextProduct, current.isCustom)
  const { id: _id, isCustom: _custom, isDeleted: _deleted, ...data } = mapped
  const result = await tx.product.updateMany({ where: { id, revision }, data: { ...data, revision: { increment: 1 } } })
  if (result.count !== 1) throw new ProductMutationError('Product was changed by another administrator. Reload and try again.', 409)
  if (overrides[id]) {
    delete overrides[id]
    await tx.keyValueSetting.update({ where: { key: 'product-overrides' }, data: { value: overrides as Prisma.InputJsonValue } })
  }
  const next = await tx.product.findUniqueOrThrow({ where: { id } })
  return { before, next }
}
