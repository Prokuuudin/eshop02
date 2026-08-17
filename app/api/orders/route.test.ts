import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  createServerOrder: vi.fn(),
  releaseExpiredStockReservations: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {},
  InsufficientBonusPointsError: class InsufficientBonusPointsError extends Error {},
  PromoCodeUsageLimitError: class PromoCodeUsageLimitError extends Error {},
}))
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
import { createServerOrder } from '@/lib/orders-data-store'
import { releaseExpiredStockReservations } from '@/lib/orders-data-store'
import { checkRateLimit } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { getTemplates } from '@/lib/email-templates-server-store'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
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
  legalDetails: { customerType: 'individual', personalCode: '010101-12345' },
  deliveryMethod: 'courier',
  paymentMethod: 'card',
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

function makeRequest(order: Record<string, unknown> = VALID_ORDER): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify({ order }),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/orders — admin notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('rejects an individual order without a personal code', async () => {
    const res = await POST(makeRequest({ ...VALID_ORDER, legalDetails: { customerType: 'individual', personalCode: '' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_legal_details')
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('defaults to individual and requires a personal code when legalDetails is omitted', async () => {
    const { legalDetails: omitted, ...orderWithoutLegalDetails } = VALID_ORDER
    void omitted
    const res = await POST(makeRequest(orderWithoutLegalDetails))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_legal_details')
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
