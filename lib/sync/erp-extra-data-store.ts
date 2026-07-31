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

/**
 * Looks up ERP extra data (price1-4, per-warehouse quantities) for a single externalId.
 *
 * Intended for admin/CLI/batch use only — it calls getErpExtraData() under the hood,
 * which loads and JSON-parses the entire multi-MB extra-data blob just to pick out one
 * entry. Do NOT call this from a per-request hot path (e.g. an API route handler); that
 * would mean parsing the whole blob on every HTTP request. A future per-request feature
 * should either cache the parsed blob or add a dedicated indexed lookup instead.
 */
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
