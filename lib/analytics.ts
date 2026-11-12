import { getCookieConsent } from '@/lib/cookie-consent'

export const GA4_MEASUREMENT_ID = 'G-P8M9PL86X1'
export const GA4_READY_EVENT = 'eshop-ga4-ready'
export const GA4_SCRIPT_ID = 'eshop-ga4-script'

const PURCHASE_KEY_PREFIX = `eshop_ga4_purchase:${GA4_MEASUREMENT_ID}:`

export type AnalyticsItemInput = {
  id: string
  sku?: string
  title: string
  brand?: string
  category?: string
  price: number
  quantity?: number
  variant?: string
}

export type Ga4Item = {
  item_id: string
  item_name: string
  item_brand?: string
  item_category?: string
  item_variant?: string
  price: number
  quantity: number
}

export type PurchaseInput = {
  id: string
  paymentStatus?: string
  total: number
  tax?: number
  delivery?: number
  promoCode?: string
  items: AnalyticsItemInput[]
}

type AnalyticsStorage = Pick<Storage, 'getItem' | 'setItem'>
type Ga4EventParameters = Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function isGa4Host(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  return normalized === 'hairshoppro.lv' || normalized === 'www.hairshoppro.lv'
}

export function isPayseraReturn(pathname: string, search: string, referrer: string): boolean {
  const paymentResult = new URLSearchParams(search).get('payment')
  if (/\/(?:ru|lv|en)\/order\/[^/]+\/?$/.test(pathname) && (paymentResult === 'success' || paymentResult === 'failed')) {
    return true
  }

  try {
    const hostname = new URL(referrer).hostname.toLowerCase()
    return hostname === 'paysera.com' || hostname.endsWith('.paysera.com')
  } catch {
    return false
  }
}

export function toGa4Item(item: AnalyticsItemInput): Ga4Item {
  return {
    item_id: item.sku?.trim() || item.id,
    item_name: item.title,
    ...(item.brand ? { item_brand: item.brand } : {}),
    ...(item.category ? { item_category: item.category } : {}),
    ...(item.variant ? { item_variant: item.variant } : {}),
    price: money(item.price),
    quantity: item.quantity ?? 1,
  }
}

export function buildPurchaseParameters(order: PurchaseInput): Ga4EventParameters {
  return {
    transaction_id: order.id,
    value: money(order.total),
    currency: 'EUR',
    ...(typeof order.tax === 'number' ? { tax: money(order.tax) } : {}),
    ...(typeof order.delivery === 'number' ? { shipping: money(order.delivery) } : {}),
    ...(order.promoCode ? { coupon: order.promoCode } : {}),
    items: order.items.map(toGa4Item),
  }
}

export function purchaseStorageKey(transactionId: string): string {
  return `${PURCHASE_KEY_PREFIX}${transactionId}`
}

export function sendGa4Event(name: string, parameters: Ga4EventParameters = {}): boolean {
  if (typeof window === 'undefined' || !getCookieConsent()?.analytics || typeof window.gtag !== 'function') {
    return false
  }

  window.gtag('event', name, { ...parameters, send_to: GA4_MEASUREMENT_ID })
  return true
}

export function trackViewItem(item: AnalyticsItemInput): boolean {
  return sendGa4Event('view_item', {
    currency: 'EUR',
    value: money(item.price * (item.quantity ?? 1)),
    items: [toGa4Item(item)],
  })
}

export function trackAddToCart(item: AnalyticsItemInput): boolean {
  return sendGa4Event('add_to_cart', {
    currency: 'EUR',
    value: money(item.price * (item.quantity ?? 1)),
    items: [toGa4Item(item)],
  })
}

export function trackBeginCheckout(items: AnalyticsItemInput[], value: number): boolean {
  return sendGa4Event('begin_checkout', {
    currency: 'EUR',
    value: money(value),
    items: items.map(toGa4Item),
  })
}

export function trackSignUp(method: string): boolean {
  return sendGa4Event('sign_up', { method })
}

export function trackClientCardActivation(): boolean {
  return sendGa4Event('client_card_activation', { method: 'client_card' })
}

export function trackPurchaseOnce(order: PurchaseInput, storage?: AnalyticsStorage): boolean {
  if (order.paymentStatus !== 'paid' || typeof window === 'undefined') return false

  const target = storage ?? window.localStorage
  const key = purchaseStorageKey(order.id)
  try {
    if (target.getItem(key)) return false
  } catch {
    // A blocked storage API must not prevent a consented purchase event.
  }

  if (!sendGa4Event('purchase', buildPurchaseParameters(order))) return false

  try {
    target.setItem(key, new Date().toISOString())
  } catch {
    // GA4 also deduplicates purchases by transaction_id.
  }
  return true
}
