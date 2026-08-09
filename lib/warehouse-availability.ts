import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { Language } from '@/data/translations'

export type WarehouseAvailability = {
  id: string
  name: string
  address: string
  quantity: number | null
}

export type ProductWarehouseAvailability = {
  available: boolean
  updatedAt: string | null
  stores: WarehouseAvailability[]
}

type WarehouseDefinition = {
  id: string
  names: Record<Language, string>
  address: string
  public: boolean
}

// These ids are the real GrinS warehouse ids. Keep this list in the same order as
// the public store list; 10000 is the central warehouse and is not a walk-in shop.
const WAREHOUSES: readonly WarehouseDefinition[] = [
  { id: '10001', names: { ru: 'Рига (Плявниеки)', en: 'Riga (Pļavnieki)', lv: 'Rīga (Pļavnieki)' }, address: 'Brāļu Kaudzīšu iela 13, Rīga', public: true },
  { id: '10002', names: { ru: 'Рига (Иманта)', en: 'Riga (Imanta)', lv: 'Rīga (Imanta)' }, address: 'Anniņmuižas bulvāris 82, Rīga', public: true },
  { id: '10005', names: { ru: 'Рига (Rencēnu iela)', en: 'Riga (Rencēnu iela)', lv: 'Rīga (Rencēnu iela)' }, address: 'Rencēnu iela 10A, Rīga', public: true },
  { id: '10004', names: { ru: 'Даугавпилс', en: 'Daugavpils', lv: 'Daugavpils' }, address: 'Viestura iela 68, Daugavpils', public: true },
  { id: '10003', names: { ru: 'Лиепая', en: 'Liepāja', lv: 'Liepāja' }, address: 'Graudu iela 43N, Liepāja', public: true },
  { id: '10006', names: { ru: 'Валмиера', en: 'Valmiera', lv: 'Valmiera' }, address: 'Stacijas iela 17, Valmiera', public: true },
  { id: '10007', names: { ru: 'Резекне', en: 'Rēzekne', lv: 'Rēzekne' }, address: 'Atbrīvošanas aleja 128, Rēzekne', public: true },
  { id: '10010', names: { ru: 'Елгава', en: 'Jelgava', lv: 'Jelgava' }, address: 'Katoļu iela 1A, Jelgava', public: true },
  { id: '10000', names: { ru: 'Центральный склад', en: 'Central warehouse', lv: 'Centrālā noliktava' }, address: 'Rencēnu iela 10A, Rīga', public: false },
]

const loadExtraData = unstable_cache(async () => {
  const row = await prisma.keyValueSetting.findUnique({
    where: { key: 'erp-extra-data' },
    select: { value: true, updatedAt: true },
  })
  return row ? { value: row.value as Record<string, unknown>, updatedAt: row.updatedAt } : null
}, ['erp-extra-data-for-store-availability'], { revalidate: 300 })

export async function getProductWarehouseAvailability(productId: string, language: Language): Promise<ProductWarehouseAvailability> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { externalId: true },
  })
  const snapshot = await loadExtraData()
  const entry = product?.externalId && snapshot
    ? snapshot.value[product.externalId] as { warehouseQuantities?: Record<string, number> } | undefined
    : undefined
  const quantities = entry?.warehouseQuantities

  return {
    available: Boolean(quantities),
    updatedAt: quantities ? snapshot?.updatedAt.toISOString() ?? null : null,
    stores: WAREHOUSES.filter((warehouse) => warehouse.public).map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.names[language],
      address: warehouse.address,
      quantity: quantities && Number.isFinite(quantities[warehouse.id]) ? quantities[warehouse.id] : null,
    })),
  }
}
