import {
  GA4_MEASUREMENT_ID,
  buildPurchaseParameters,
  isGa4Host,
  isPayseraReturn,
  purchaseStorageKey,
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
      transaction_id: '1001', value: 25.5, currency: 'EUR', tax: 4.43, shipping: 2.5,
      coupon: 'SAVE10',
      items: [{ item_id: 'product-1', item_name: 'Shampoo', price: 11.5, quantity: 2 }],
    })
  })

  it('sends only paid purchases and persists refresh deduplication', () => {
    const storage = new MemoryStorage()
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      necessary: true, analytics: true, marketing: false, ts: 1,
    }))
    const gtag = vi.fn()
    vi.stubGlobal('window', { localStorage: storage, gtag })
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
