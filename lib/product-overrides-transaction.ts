import type { Product } from '@/data/products'
import type { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'

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
