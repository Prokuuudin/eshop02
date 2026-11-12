import {
  GA4_MEASUREMENT_ID,
  buildPurchaseParameters,
  isGa4Host,
  isPayseraReturn,
  purchaseStorageKey,
  revokeGa4Runtime,
  sendGa4Event,
  setGa4Operational,
  toGa4Item,
  trackPurchaseOnce,
} from './analytics'
import { COOKIE_CONSENT_KEY, parseCookieConsent } from './cookie-consent'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('GA4 analytics', () => {
  afterEach(() => {
    setGa4Operational(false)
    vi.unstubAllGlobals()
  })

  it('accepts only a complete analytics consent value', () => {
    expect(parseCookieConsent(JSON.stringify({ necessary: true, analytics: true, marketing: false, ts: 1 })))
      .toEqual({ necessary: true, analytics: true, marketing: false, ts: 1 })
    expect(parseCookieConsent(JSON.stringify({ necessary: true, analytics: 'yes', marketing: false, ts: 1 }))).toBeNull()
    expect(parseCookieConsent('not-json')).toBeNull()
  })

  it('enables the production Hairshop Pro hosts only', () => {
    expect(isGa4Host('hairshoppro.lv')).toBe(true)
    expect(isGa4Host('WWW.HAIRSHOPPRO.LV.')).toBe(true)
    expect(isGa4Host('hairshop.lv')).toBe(false)
    expect(isGa4Host('preview.vercel.app')).toBe(false)
  })

  it('recognizes Paysera returns without treating ordinary order pages as returns', () => {
    expect(isPayseraReturn('/ru/order/1001', 'payment=success', '')).toBe(true)
    expect(isPayseraReturn('/lv/order/1001', '', 'https://bank.paysera.com/pay/1001')).toBe(true)
    expect(isPayseraReturn('/en/order/1001', '', 'https://hairshoppro.lv/en/checkout')).toBe(false)
  })

  it('maps ecommerce items and purchase totals without customer data', () => {
    expect(toGa4Item({
      id: 'product-1', sku: 'SKU-1', title: 'Shampoo', brand: 'Brand', category: 'hair',
      variant: 'Size: 1L', price: 12.345, quantity: 2,
    })).toEqual({
      item_id: 'SKU-1', item_name: 'Shampoo', item_brand: 'Brand', item_category: 'hair',
      item_variant: 'Size: 1L', price: 12.35, quantity: 2,
    })

    expect(buildPurchaseParameters({
      id: '1001', paymentStatus: 'paid', total: 25.5, tax: 4.43, delivery: 2.5,
      promoCode: 'SAVE10', items: [{ id: 'product-1', title: 'Shampoo', price: 11.5, quantity: 2 }],
    })).toEqual({
      transaction_id: '1001', value: 18.57, currency: 'EUR', tax: 4.43, shipping: 2.5,
      coupon: 'SAVE10',
      items: [{ item_id: 'product-1', item_name: 'Shampoo', price: 9.285, quantity: 2 }],
    })
  })

  it('keeps discounted item lines equal to purchase value while preserving variants', () => {
    const parameters = buildPurchaseParameters({
      id: '1002', paymentStatus: 'paid', total: 24.2, tax: 3.2, delivery: 2,
      items: [
        { id: 'p1', title: 'Color', variant: 'Tone: 7.1', price: 10, quantity: 2 },
        { id: 'p2', title: 'Mask', price: 5, quantity: 1 },
      ],
    })
    const items = parameters.items as Array<{ price: number; quantity: number; item_variant?: string }>

    expect(parameters.value).toBe(19)
    expect(items[0].item_variant).toBe('Tone: 7.1')
    expect(items.reduce((sum, item) => sum + item.price * item.quantity, 0)).toBeCloseTo(19, 10)
  })

  it('sends only paid purchases and persists refresh deduplication', () => {
    const storage = new MemoryStorage()
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      necessary: true, analytics: true, marketing: false, ts: 1,
    }))
    const gtag = vi.fn()
    vi.stubGlobal('window', { localStorage: storage, gtag })
    setGa4Operational(true)
    const order = {
      id: '1001', paymentStatus: 'paid', total: 10,
      items: [{ id: 'p1', title: 'Product', price: 10, quantity: 1 }],
    }

    expect(trackPurchaseOnce({ ...order, paymentStatus: 'unpaid' }, storage)).toBe(false)
    expect(trackPurchaseOnce(order, storage)).toBe(true)
    expect(trackPurchaseOnce(order, storage)).toBe(false)
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({
      transaction_id: '1001', currency: 'EUR', send_to: GA4_MEASUREMENT_ID,
    }))
    expect(storage.getItem(purchaseStorageKey('1001'))).toBeTruthy()
  })

  it('does not mark a purchase as sent while the Google tag is blocked', () => {
    const storage = new MemoryStorage()
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      necessary: true, analytics: true, marketing: false, ts: 1,
    }))
    const gtag = vi.fn()
    vi.stubGlobal('window', { localStorage: storage, gtag })

    expect(trackPurchaseOnce({
      id: 'blocked-1', paymentStatus: 'paid', total: 10,
      items: [{ id: 'p1', title: 'Product', price: 10 }],
    }, storage)).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
    expect(storage.getItem(purchaseStorageKey('blocked-1'))).toBeNull()
  })

  it('denies consent and clears queued commands when analytics consent is revoked', () => {
    const storage = new MemoryStorage()
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      necessary: true, analytics: true, marketing: false, ts: 1,
    }))
    const gtag = vi.fn()
    const dataLayer: unknown[] = [['event', 'purchase', { transaction_id: 'queued-1' }]]
    const runtime = { localStorage: storage, gtag, dataLayer } as Record<string, unknown>
    vi.stubGlobal('window', runtime)
    setGa4Operational(true)

    revokeGa4Runtime()

    expect(runtime[`ga-disable-${GA4_MEASUREMENT_ID}`]).toBe(true)
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    expect(dataLayer).toEqual([])
    expect(runtime.gtag).toBeUndefined()
    expect(sendGa4Event('page_view')).toBe(false)
  })

  it('does not send a purchase without analytics consent', () => {
    const storage = new MemoryStorage()
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      necessary: true, analytics: false, marketing: false, ts: 1,
    }))
    const gtag = vi.fn()
    vi.stubGlobal('window', { localStorage: storage, gtag })

    expect(trackPurchaseOnce({
      id: '1002', paymentStatus: 'paid', total: 10,
      items: [{ id: 'p1', title: 'Product', price: 10 }],
    }, storage)).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })
})
