import { prisma, type ExtendedTransactionClient } from './prisma'
import { applySpreadsheetDeliveryTariffs } from './delivery'
import { COMMERCE_SETTINGS_KEY, normalizeCommerceSettings, type CommerceSettings } from './commerce-settings'

export async function getShippingSettings(db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma): Promise<CommerceSettings> {
  const row = await db.keyValueSetting.findUnique({ where: { key: COMMERCE_SETTINGS_KEY } })
  return applySpreadsheetDeliveryTariffs(normalizeCommerceSettings(row?.value))
}
