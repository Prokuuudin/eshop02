import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/shipping-settings-server', async () => {
  const { DEFAULT_COMMERCE_SETTINGS } = await import('@/lib/commerce-settings')
  return { getShippingSettings: vi.fn(async () => structuredClone(DEFAULT_COMMERCE_SETTINGS)) }
})
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  createServerOrder: vi.fn(),
  updateServerOrderPayment: vi.fn(),
  releaseExpiredStockReservations: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {},
  InsufficientBonusPointsError: class InsufficientBonusPointsError extends Error {},
  PromoCodeUsageLimitError: class PromoCodeUsageLimitError extends Error {},
  ExistingCheckoutOrderError: class ExistingCheckoutOrderError extends Error {
    constructor(public readonly order: { id: string }) { super('existing checkout') }
  },
}))
vi.mock('@/lib/paysera', () => ({ createPayseraPaymentForOrder: vi.fn() }))
vi.mock('@/lib/paypal', () => ({ createPaypalPaymentForOrder: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))
vi.mock('@/lib/turnstile-server', () => ({
  verifyTurnstile: vi.fn(),
  isTurnstileRequired: vi.fn(),
  TurnstileConfigurationError: class TurnstileConfigurationError extends Error {},
}))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/server-pricing', () => ({
  recomputeOrderPricing: vi.fn(),
}))
vi.mock('@/lib/locale-config-server-store', () => ({
  getLocaleConfig: vi.fn(),
}))

import { sendEmail } from '@/lib/mailer'
import { getServerUser } from '@/lib/server-auth'
import { createServerOrder, ExistingCheckoutOrderError, updateServerOrderPayment } from '@/lib/orders-data-store'
import { releaseExpiredStockReservations } from '@/lib/orders-data-store'
import { createPayseraPaymentForOrder } from '@/lib/paysera'
import { createPaypalPaymentForOrder } from '@/lib/paypal'
import { checkRateLimit } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { getTemplates } from '@/lib/email-templates-server-store'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { getShippingSettings } from '@/lib/shipping-settings-server'
import { DEFAULT_COMMERCE_SETTINGS } from '@/lib/commerce-settings'
import { getDeliveryLocations } from '@/lib/delivery-locations'
import { POST } from './route'

const VALID_ORDER = {
  id: 'ORD-001',
  createdAt: '2026-06-16T10:00:00.000Z',
  firstName: 'Ivan',
  lastName: 'Petrov',
  email: 'ivan@example.com',
  phone: '+37126000000',
  address: 'Riga st 1',
  city: 'Riga',
  postalCode: '1001',
  legalDetails: { customerType: 'individual' },
  deliveryMethod: 'courier',
  paymentMethod: 'bank',
  items: [
    { id: 'p1', title: 'Shampoo Pro', brand: 'Brand', image: '', category: 'hair', price: 25, rating: 5, stock: 10, quantity: 2 },
  ],
  subtotal: 50,
  discount: 0,
  tax: 9,
  delivery: 5,
  total: 64,
  promoCode: undefined,
  language: 'ru',
}

function makeRequest(order: Record<string, unknown> = VALID_ORDER, idempotencyKey?: string): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify({ order }),
    headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
  })
}

describe('POST /api/orders — admin notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getShippingSettings).mockResolvedValue(structuredClone(DEFAULT_COMMERCE_SETTINGS))
    vi.mocked(getServerUser).mockResolvedValue(null)
    // Server assigns the canonical id — echo the payload back under a generated id
    vi.mocked(createServerOrder).mockImplementation(async (order, prepare) => ({
      ...((prepare ? await prepare({} as never, null) : order) as object),
      id: '1001',
    }) as never)
    vi.mocked(getTemplates).mockResolvedValue([])
    vi.mocked(recomputeOrderPricing).mockResolvedValue({
      items: [{ id: 'p1', price: 25, quantity: 2, bonusRate: 0, fromCatalog: true }],
      subtotal: 50,
      discount: 0,
      tax: 9,
      delivery: 5,
      bonusSpent: 0,
      bonusEarned: 0,
      total: 64,
      promoApplied: false,
    })
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    vi.mocked(releaseExpiredStockReservations).mockResolvedValue(0)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 2, resetAt: Date.now() + 60_000 })
    vi.mocked(verifyTurnstile).mockResolvedValue(true)
    vi.mocked(isTurnstileRequired).mockReturnValue(false)
    vi.mocked(getLocaleConfig).mockResolvedValue({
      defaultLanguage: 'ru',
      dateFormat: 'DD.MM.YYYY',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })
    process.env.CONTACT_TO = 'admin@shop.com'
  })

  it('rejects unsupported countries before creating an order', async () => {
    expect((await POST(makeRequest({ ...VALID_ORDER, country: 'DE' }))).status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })
  it('rejects disabled delivery methods', async () => {
    const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
    settings.delivery.omniva.enabled = false
    vi.mocked(getShippingSettings).mockResolvedValue(settings)
    expect((await POST(makeRequest({ ...VALID_ORDER, deliveryMethod: 'post' }))).status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })
  it('passes the selected country to authoritative pricing', async () => {
    expect((await POST(makeRequest({ ...VALID_ORDER, country: 'LT' }))).status).toBe(200)
    expect(recomputeOrderPricing).toHaveBeenCalledWith(expect.objectContaining({ country: 'LT' }), expect.anything())
  })

  it('requires a locker from the correct carrier and country', async () => {
    const venipak = getDeliveryLocations('venipak', 'LV')[0]
    for (const order of [
      { ...VALID_ORDER, deliveryMethod: 'unisend' },
      { ...VALID_ORDER, deliveryMethod: 'unisend', deliveryLocationId: venipak.id },
      { ...VALID_ORDER, deliveryMethod: 'unisend', country: 'LV', deliveryLocationId: '0023' },
    ]) expect((await POST(makeRequest(order))).status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })
  it('stores an authoritative terminal snapshot instead of client-supplied address metadata', async () => {
    const terminal = getDeliveryLocations('unisend', 'LV')[0]
    const response = await POST(makeRequest({ ...VALID_ORDER, deliveryMethod: 'unisend', deliveryLocationId: terminal.id, deliveryLocation: { id: terminal.id, address: 'FORGED ADDRESS' } }))
    expect(response.status).toBe(200)
    expect((await response.json()).deliveryLocation).toEqual(terminal)
    expect(createServerOrder).toHaveBeenCalledWith(expect.objectContaining({ deliveryLocation: terminal }), expect.any(Function))
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledWith(VALID_ORDER.email, expect.any(String), expect.stringContaining(`ID: ${terminal.id}`)))
  })

  it('sends email to CONTACT_TO with order id in subject', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // Wait for fire-and-forget emails to flush
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(1))

    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    expect(adminCall).toBeDefined()
    const [, subject, html] = adminCall!
    expect(subject).toContain('1001')
    expect(html).toContain('1001')
    expect(html).toContain('Ivan')
    expect(html).toContain('64')
  })

  it('ignores the client-supplied id and returns the server-generated orderId', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const json = (await res.json()) as { orderId?: string }
    expect(json.orderId).toBe('1001')

    // The persisted payload must not carry the client id — the server generates it
    const persisted = vi.mocked(createServerOrder).mock.calls[0][0] as Record<string, unknown>
    expect(persisted.id).toBeUndefined()
  })

  it('scopes and hashes an idempotency key before persistence', async () => {
    const res = await POST(makeRequest(VALID_ORDER, 'checkout-ORD-001'))
    expect(res.status).toBe(200)
    const persisted = vi.mocked(createServerOrder).mock.calls[0][0]
    expect(persisted.checkoutKey).toMatch(/^[a-f0-9]{64}$/)
    expect(persisted.checkoutKey).not.toContain('ORD-001')
  })

  it('returns the existing order for a concurrent duplicate without sending emails', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({ id: '1001' } as never))
    const res = await POST(makeRequest(VALID_ORDER, 'checkout-ORD-001'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, orderId: '1001', idempotent: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mints a fresh Paysera payment link on a duplicate resubmit of an unpaid paysera order', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', paymentMethod: 'paysera', paymentStatus: 'unpaid', total: 64, language: 'ru',
    } as never))
    vi.mocked(createPayseraPaymentForOrder).mockResolvedValue({ payseraOrderId: 'pay-2', paymentUrl: 'https://bank.paysera.com/pay/2' })

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paysera' }, 'checkout-ORD-001'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true, orderId: '1001', idempotent: true, paymentUrl: 'https://bank.paysera.com/pay/2',
    })
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentSessionId: 'pay-2' })
  })

  it('does not mint a new payment link for a duplicate resubmit of an already-paid paysera order', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', paymentMethod: 'paysera', paymentStatus: 'paid', total: 64, language: 'ru',
    } as never))

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paysera' }, 'checkout-ORD-001'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, orderId: '1001', idempotent: true })
    expect(createPayseraPaymentForOrder).not.toHaveBeenCalled()
  })

  it('falls back to a plain idempotent response when re-minting the payment link fails', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', paymentMethod: 'paysera', paymentStatus: 'unpaid', total: 64, language: 'ru',
    } as never))
    vi.mocked(createPayseraPaymentForOrder).mockRejectedValue(new Error('gateway down'))

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paysera' }, 'checkout-ORD-001'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, orderId: '1001', idempotent: true })
  })

  it('creates a PayPal order and returns its approval link for a fresh checkout', async () => {
    vi.mocked(createPaypalPaymentForOrder).mockResolvedValue({ paypalOrderId: 'pp-1', paymentUrl: 'https://www.paypal.com/checkoutnow?token=pp-1' })

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paypal' }))

    expect(res.status).toBe(200)
    const json = (await res.json()) as { paymentUrl?: string }
    expect(json.paymentUrl).toBe('https://www.paypal.com/checkoutnow?token=pp-1')
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentSessionId: 'pp-1' })
  })

  it('fails the order (releasing the stock hold) when PayPal order creation fails', async () => {
    vi.mocked(createPaypalPaymentForOrder).mockRejectedValue(new Error('gateway down'))
    vi.mocked(updateServerOrderPayment).mockResolvedValue(undefined as never)

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paypal' }))

    expect(res.status).toBe(502)
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentStatus: 'failed' })
  })

  it('mints a fresh PayPal payment link on a duplicate resubmit of an unpaid paypal order', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', paymentMethod: 'paypal', paymentStatus: 'unpaid', total: 64, language: 'ru',
    } as never))
    vi.mocked(createPaypalPaymentForOrder).mockResolvedValue({ paypalOrderId: 'pp-2', paymentUrl: 'https://www.paypal.com/checkoutnow?token=pp-2' })

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paypal' }, 'checkout-ORD-001'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true, orderId: '1001', idempotent: true, paymentUrl: 'https://www.paypal.com/checkoutnow?token=pp-2',
    })
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentSessionId: 'pp-2' })
  })

  it('does not mint a new payment link for a duplicate resubmit of an already-paid paypal order', async () => {
    vi.mocked(createServerOrder).mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', paymentMethod: 'paypal', paymentStatus: 'paid', total: 64, language: 'ru',
    } as never))

    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paypal' }, 'checkout-ORD-001'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, orderId: '1001', idempotent: true })
    expect(createPaypalPaymentForOrder).not.toHaveBeenCalled()
  })

  it('does not send admin email when CONTACT_TO is not set', async () => {
    delete process.env.CONTACT_TO
    await POST(makeRequest())
    // Customer email still fires — wait for it so we're not racing
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(1))
    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    expect(adminCall).toBeUndefined()
  })

  it('ignores a client-supplied creation date in the persisted notification', async () => {
    vi.mocked(getLocaleConfig).mockResolvedValue({
      defaultLanguage: 'ru',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })

    await POST(makeRequest({ ...VALID_ORDER, createdAt: '2026-06-16T10:00:00.000Z' }))
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(1))

    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    const [, , html] = adminCall!
    expect(html).not.toContain('2026-06-16')
  })

  it('accepts the bank-transfer option offered by checkout', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'bank' }))

    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('accepts the PayPal option offered by checkout', async () => {
    vi.mocked(createPaypalPaymentForOrder).mockResolvedValue({ paypalOrderId: 'pp-1', paymentUrl: 'https://www.paypal.com/checkoutnow?token=pp-1' })
    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'paypal' }))

    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('rejects online card payment — card is office-only, never an online checkout method', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, paymentMethod: 'card' }))

    expect(res.status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rate-limits a guest by IP and normalized email before reserving stock', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ ...VALID_ORDER, email: ' Buyer@Example.com ' }))
    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('order-create:email:buyer@example.com', expect.any(Object))
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('requires Turnstile for guests when it is configured', async () => {
    vi.mocked(isTurnstileRequired).mockReturnValue(true)
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('captcha_required')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('fails closed before reserving stock when Turnstile is not configured', async () => {
    vi.mocked(isTurnstileRequired).mockImplementation(() => { throw new TurnstileConfigurationError() })
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('captcha_not_configured')
    expect(createServerOrder).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects oversized contact fields and item lists before DB work', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, firstName: 'x'.repeat(101) }))
    expect(res.status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('accepts an individual order with no personal code at all — the invoice code is optional', async () => {
    const { legalDetails: omitted, ...orderWithoutLegalDetails } = VALID_ORDER
    void omitted
    const res = await POST(makeRequest(orderWithoutLegalDetails))
    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('never persists a personal code even if a client sends one — only invoicePersonalCode is accepted', async () => {
    const res = await POST(makeRequest({
      ...VALID_ORDER,
      legalDetails: { customerType: 'individual', personalCode: '010101-12345' },
    }))
    expect(res.status).toBe(200)
    const persisted = vi.mocked(createServerOrder).mock.calls[0][0] as { legalDetails?: unknown }
    expect(persisted.legalDetails).toEqual({ customerType: 'individual' })
  })

  it('stores a trimmed customer code only in the invoice details of the matching order', async () => {
    const res = await POST(makeRequest({
      ...VALID_ORDER,
      legalDetails: { customerType: 'individual', invoicePersonalCode: ' 010101-12345 ' },
    }))
    expect(res.status).toBe(200)
    const persisted = vi.mocked(createServerOrder).mock.calls[0][0]
    expect(persisted.legalDetails).toEqual({ customerType: 'individual', invoicePersonalCode: '010101-12345' })
    expect(persisted).not.toHaveProperty('invoicePersonalCode')
  })

  it.each([42, 'x'.repeat(65)])('rejects an invalid invoice-specific code: %s', async (invoicePersonalCode) => {
    const res = await POST(makeRequest({ ...VALID_ORDER, legalDetails: { customerType: 'individual', invoicePersonalCode } }))
    expect(res.status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  const COMPANY_LEGAL_DETAILS = {
    customerType: 'company',
    companyName: 'SIA Test',
    regNumber: '40001234567',
    legalAddress: 'Rencēnu 10A, Rīga, LV-1073',
    bankName: 'Swedbank',
    iban: 'LV80BANK0000435195001',
  }

  it('accepts a company order with required company fields but no VAT number', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, legalDetails: COMPANY_LEGAL_DETAILS }))
    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('rejects a company order missing companyName or regNumber', async () => {
    const res = await POST(makeRequest({
      ...VALID_ORDER,
      legalDetails: { ...COMPANY_LEGAL_DETAILS, companyName: '' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_legal_details')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rejects a company order missing legalAddress', async () => {
    const res = await POST(makeRequest({
      ...VALID_ORDER,
      legalDetails: { ...COMPANY_LEGAL_DETAILS, legalAddress: '' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_legal_details')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('accepts a company order without bank name and IBAN', async () => {
    const res = await POST(makeRequest({
      ...VALID_ORDER,
      legalDetails: { ...COMPANY_LEGAL_DETAILS, bankName: '', iban: '' },
    }))
    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('accepts a company order without a phone number', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, legalDetails: COMPANY_LEGAL_DETAILS, phone: '' }))
    expect(res.status).toBe(200)
    expect(createServerOrder).toHaveBeenCalledOnce()
  })

  it('still requires a phone number for individual orders', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, phone: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_contact_fields')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized customerType', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, legalDetails: { customerType: 'bogus' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_legal_details')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('escapes customer-controlled names in confirmation email templates', async () => {
    await POST(makeRequest({ ...VALID_ORDER, firstName: '<img src=x onerror=alert(1)>' }))
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled())
    const customerCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === VALID_ORDER.email)
    expect(customerCall?.[2]).not.toContain('<img')
    expect(customerCall?.[2]).toContain('&lt;img')
  })

  it('renders distinct customer confirmations for ru, en and lv without recipient-list leakage', async () => {
    delete process.env.CONTACT_TO
    const subjects: string[] = []

    for (const language of ['ru', 'en', 'lv'] as const) {
      const email = `${language}@example.com`
      await POST(makeRequest({ ...VALID_ORDER, language, email }))
      await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.some(([to]) => to === email)).toBe(true))
      const [, subject, html] = vi.mocked(sendEmail).mock.calls.find(([to]) => to === email)!
      subjects.push(subject)
      expect(html).toContain('1001')
      for (const other of ['ru', 'en', 'lv'].filter((candidate) => candidate !== language)) {
        expect(html).not.toContain(`${other}@example.com`)
      }
    }

    expect(new Set(subjects).size).toBe(3)
  })
})
