import type { Product } from '@/data/products'
import type { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendProductOverrideResetAudit, type ProductAuditContext } from '@/lib/product-archive-audit'

export type ProductOverrideMap = Record<string, Partial<Omit<Product, 'id'>>>

export async function readProductOverridesTx(
  tx: ExtendedTransactionClient,
  key: string,
): Promise<ProductOverrideMap> {
  const row = await tx.keyValueSetting.findUnique({ where: { key } })
  const parsed = row?.value as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as ProductOverrideMap
    : {}
}

export async function writeProductOverridesTx(
  tx: ExtendedTransactionClient,
  key: string,
  overrides: ProductOverrideMap,
): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key },
    create: { key, value: overrides as unknown as Prisma.InputJsonValue },
    update: { value: overrides as unknown as Prisma.InputJsonValue },
  })
}

export async function resetProductOverrideTx(
  tx: ExtendedTransactionClient,
  key: string,
  productId: string,
  audit: ProductAuditContext,
): Promise<{ success: true } | { success: false; error: string }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product || product.isDeleted) return { success: false, error: 'Товар не найден' }

  const overrides = await readProductOverridesTx(tx, key)
  const previous = overrides[productId]
  if (!previous) return { success: true }

  delete overrides[productId]
  await writeProductOverridesTx(tx, key, overrides)
  await appendProductOverrideResetAudit(tx, audit, product, previous)
  return { success: true }
}
