import { describe, expect, it } from 'vitest'
import { getSyncRules, selectedStock } from './sync-rules'

describe('sync rules', () => {
  it('keeps primary price selection independent from enabled stored tiers', () => {
    const rules = getSyncRules({ NODE_ENV: 'test', SYNC_PRIMARY_PRICE_TIER: 'price2', SYNC_ENABLED_PRICE_TIERS: 'price1,price4' } as NodeJS.ProcessEnv)
    expect(rules.primaryPriceTier).toBe('price2')
    expect([...rules.enabledPriceTiers]).toEqual(['price1', 'price4'])
  })

  it('sums only 10000, 10001, 10002 and 10005 and clamps negative quantities', () => {
    expect(selectedStock({ '10000': 2, '10001': 3, '10002': -9, '10005': 4, '10003': 100 })).toBe(9)
  })
})
