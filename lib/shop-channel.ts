/**
 * Storefront channel of this deployment: `b2b` (hairshoppro.lv) or `b2c` (hairshop.lv).
 *
 * The channel is fixed per deployment by the server-only SHOP_CHANNEL environment
 * variable. It is never derived from a request (Host, headers, cookies, query), so a
 * client cannot switch a deployment into the other channel. Unset or empty means `b2b`,
 * which keeps every existing Hairshop Pro deployment unchanged.
 */

export const SHOP_CHANNELS = ['b2b', 'b2c'] as const
export type ShopChannel = (typeof SHOP_CHANNELS)[number]

export const DEFAULT_SHOP_CHANNEL: ShopChannel = 'b2b'

export class ShopChannelConfigError extends Error {
  constructor(readonly value: string) {
    super(`Invalid SHOP_CHANNEL: ${JSON.stringify(value)} (expected one of: ${SHOP_CHANNELS.join(', ')})`)
    this.name = 'ShopChannelConfigError'
  }
}

/** Strict parse: unknown values are a configuration error, never silently mapped to a channel. */
export function parseShopChannel(raw: string | undefined): ShopChannel {
  const value = raw?.trim() ?? ''
  if (value === '') return DEFAULT_SHOP_CHANNEL
  if ((SHOP_CHANNELS as readonly string[]).includes(value)) return value as ShopChannel
  throw new ShopChannelConfigError(value)
}

/** The channel of this deployment. Reads only the server environment. */
export function getShopChannel(env: NodeJS.ProcessEnv = process.env): ShopChannel {
  return parseShopChannel(env.SHOP_CHANNEL)
}

const KV_CHANNEL_SEPARATOR = ':'

/**
 * KeyValueSetting key of a channel-scoped setting. B2B keeps the existing key as is, so
 * current B2B data is read and written exactly as before; B2C gets its own `<base>:b2c`
 * key. Nothing creates the B2C rows: a missing row means "not configured yet".
 */
export function kvKey(base: string, channel: ShopChannel): string {
  if (!(SHOP_CHANNELS as readonly string[]).includes(channel)) throw new ShopChannelConfigError(String(channel))
  if (typeof base !== 'string' || base.trim() === '' || base !== base.trim()) {
    throw new Error(`Invalid KeyValueSetting base key: ${JSON.stringify(base)}`)
  }
  if (SHOP_CHANNELS.some((suffix) => base.endsWith(`${KV_CHANNEL_SEPARATOR}${suffix}`))) {
    throw new Error(`KeyValueSetting base key is already channel-scoped: ${base}`)
  }
  return channel === 'b2b' ? base : `${base}${KV_CHANNEL_SEPARATOR}${channel}`
}

/**
 * Shop settings that may be separated per channel, by their existing (B2B) KeyValueSetting
 * key. The stores below still use these keys directly; switching a store to
 * kvKey(base, getShopChannel()) is a separate, per-module change.
 */
export const SHOP_SCOPED_KV_BASES = {
  promoCampaigns: 'promo-campaigns', // lib/promo-campaigns.ts PROMO_CAMPAIGNS_KEY
  bonusProgram: 'bonusProgram', // lib/bonus-config-server-store.ts BONUS_CONFIG_KEY
  shipping: 'shipping-settings', // lib/commerce-settings.ts COMMERCE_SETTINGS_KEY
  bannerAssignments: 'banner-group-assignments', // lib/banners-server-store.ts ASSIGNMENTS_KEY
  siteContent: 'site-content', // lib/site-content-server-store.ts SITE_CONTENT_KEY
} as const
