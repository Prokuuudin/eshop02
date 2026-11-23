import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { COMMERCE_SETTINGS_KEY } from '@/lib/commerce-settings'
import { PROMO_CAMPAIGNS_KEY } from '@/lib/promo-campaigns'
import {
  DEFAULT_SHOP_CHANNEL,
  SHOP_SCOPED_KV_BASES,
  ShopChannelConfigError,
  getShopChannel,
  kvKey,
  parseShopChannel,
} from '@/lib/shop-channel'

describe('getShopChannel', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to b2b when SHOP_CHANNEL is absent', () => {
    expect(getShopChannel({} as unknown as NodeJS.ProcessEnv)).toBe('b2b')
    expect(DEFAULT_SHOP_CHANNEL).toBe('b2b')
  })

  it('treats an empty or blank value as absent (b2b)', () => {
    expect(getShopChannel({ SHOP_CHANNEL: '' } as unknown as NodeJS.ProcessEnv)).toBe('b2b')
    expect(getShopChannel({ SHOP_CHANNEL: '   ' } as unknown as NodeJS.ProcessEnv)).toBe('b2b')
  })

  it('accepts the two known channels', () => {
    expect(getShopChannel({ SHOP_CHANNEL: 'b2b' } as unknown as NodeJS.ProcessEnv)).toBe('b2b')
    expect(getShopChannel({ SHOP_CHANNEL: 'b2c' } as unknown as NodeJS.ProcessEnv)).toBe('b2c')
    expect(getShopChannel({ SHOP_CHANNEL: ' b2c\n' } as unknown as NodeJS.ProcessEnv)).toBe('b2c')
  })

  it.each(['B2C', 'B2B', 'retail', 'b2c,b2b', 'b2', 'true', '0'])('rejects unknown value %j with a configuration error', (value) => {
    expect(() => getShopChannel({ SHOP_CHANNEL: value } as unknown as NodeJS.ProcessEnv)).toThrow(ShopChannelConfigError)
    expect(() => parseShopChannel(value)).toThrow(/Invalid SHOP_CHANNEL/)
  })

  it('reads process.env by default', () => {
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    expect(getShopChannel()).toBe('b2c')
    vi.stubEnv('SHOP_CHANNEL', '')
    expect(getShopChannel()).toBe('b2b')
    vi.stubEnv('SHOP_CHANNEL', 'wholesale')
    expect(() => getShopChannel()).toThrow(ShopChannelConfigError)
  })

  it('has no request input: the only parameter is the server environment', () => {
    expect(getShopChannel.length).toBeLessThanOrEqual(1)
    // Request-shaped data passed by mistake still resolves from SHOP_CHANNEL only.
    const requestLike = { headers: { 'x-shop-channel': 'b2c' }, cookies: { shop_channel: 'b2c' }, SHOP_CHANNEL: undefined }
    expect(getShopChannel(requestLike as unknown as NodeJS.ProcessEnv)).toBe('b2b')
  })
})

describe('kvKey', () => {
  it('keeps every existing B2B key unchanged', () => {
    for (const base of Object.values(SHOP_SCOPED_KV_BASES)) expect(kvKey(base, 'b2b')).toBe(base)
  })

  it('gives B2C a separate :b2c key', () => {
    expect(kvKey('promo-campaigns', 'b2c')).toBe('promo-campaigns:b2c')
    expect(kvKey('bonusProgram', 'b2c')).toBe('bonusProgram:b2c')
    const b2c = Object.values(SHOP_SCOPED_KV_BASES).map((base) => kvKey(base, 'b2c'))
    const b2b = Object.values(SHOP_SCOPED_KV_BASES).map((base) => kvKey(base, 'b2b'))
    expect(new Set([...b2c, ...b2b]).size).toBe(b2c.length + b2b.length)
  })

  it('rejects an unknown channel', () => {
    expect(() => kvKey('promo-campaigns', 'retail' as never)).toThrow(ShopChannelConfigError)
  })

  it('rejects empty, padded or already scoped base keys', () => {
    expect(() => kvKey('', 'b2c')).toThrow()
    expect(() => kvKey(' bonusProgram', 'b2c')).toThrow()
    expect(() => kvKey('bonusProgram:b2c', 'b2c')).toThrow(/already channel-scoped/)
    expect(() => kvKey('bonusProgram:b2b', 'b2b')).toThrow(/already channel-scoped/)
  })
})

describe('SHOP_SCOPED_KV_BASES', () => {
  const source = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf-8')

  it('matches the keys the existing B2B stores use today', () => {
    expect(SHOP_SCOPED_KV_BASES.promoCampaigns).toBe(PROMO_CAMPAIGNS_KEY)
    expect(SHOP_SCOPED_KV_BASES.shipping).toBe(COMMERCE_SETTINGS_KEY)
    expect(source('lib/bonus-config-server-store.ts')).toContain(`const BONUS_CONFIG_KEY = '${SHOP_SCOPED_KV_BASES.bonusProgram}'`)
    expect(source('lib/banners-server-store.ts')).toContain(`const ASSIGNMENTS_KEY = '${SHOP_SCOPED_KV_BASES.bannerAssignments}'`)
    expect(source('lib/site-content-server-store.ts')).toContain(`const SITE_CONTENT_KEY = '${SHOP_SCOPED_KV_BASES.siteContent}'`)
  })
})
