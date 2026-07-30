import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface ErpExtraData {
  prices: { price1: number; price2: number; price3: number; price4: number }
  warehouseQuantities: Record<string, number>
}

const ERP_EXTRA_DATA_KEY = 'erp-extra-data'

export async function getErpExtraData(db: ExtendedPrismaClient): Promise<Record<string, ErpExtraData>> {
  const row = await db.keyValueSetting.findUnique({ where: { key: ERP_EXTRA_DATA_KEY } })
  const parsed = row?.value as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, ErpExtraData>)
    : {}
}

export async function getErpExtraDataFor(
  db: ExtendedPrismaClient,
  externalId: string,
): Promise<ErpExtraData | undefined> {
  const all = await getErpExtraData(db)
  return all[externalId]
}

export async function replaceErpExtraData(
  db: ExtendedPrismaClient,
  data: Record<string, ErpExtraData>,
): Promise<void> {
  await db.keyValueSetting.upsert({
    where: { key: ERP_EXTRA_DATA_KEY },
    create: { key: ERP_EXTRA_DATA_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}
