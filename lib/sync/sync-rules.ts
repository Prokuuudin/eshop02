export const PRICE_TIERS = ['price1', 'price2', 'price3', 'price4'] as const
export type PriceTier = (typeof PRICE_TIERS)[number]

export const HAIRSHOP_STOCK_WAREHOUSE_IDS = ['10000', '10001', '10002', '10005'] as const
export const EXCLUDED_STOCK_WAREHOUSE_IDS = ['10003', '10004', '10006', '10007', '10010'] as const

export interface SyncRules {
  primaryPriceTier: PriceTier
  enabledPriceTiers: ReadonlySet<PriceTier>
}

export function getSyncRules(env: NodeJS.ProcessEnv = process.env): SyncRules {
  const requestedPrimary = env.SYNC_PRIMARY_PRICE_TIER ?? 'price2'
  if (!PRICE_TIERS.includes(requestedPrimary as PriceTier)) {
    throw new Error(`Invalid SYNC_PRIMARY_PRICE_TIER: ${requestedPrimary}`)
  }
  const configured = env.SYNC_ENABLED_PRICE_TIERS
  const enabled = configured === undefined
    ? PRICE_TIERS
    : configured.split(',').map(value => value.trim()).filter(Boolean)
  const invalid = enabled.filter(value => !PRICE_TIERS.includes(value as PriceTier))
  if (invalid.length) throw new Error(`Invalid SYNC_ENABLED_PRICE_TIERS: ${invalid.join(', ')}`)
  return { primaryPriceTier: requestedPrimary as PriceTier, enabledPriceTiers: new Set(enabled as PriceTier[]) }
}

export function selectedStock(quantities: Record<string, number>): number {
  return HAIRSHOP_STOCK_WAREHOUSE_IDS.reduce((sum, id) => sum + Math.max(0, quantities[id] ?? 0), 0)
}
