import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ createServerOrder: vi.fn() }))
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

function makeRequest(order = VALID_ORDER): NextRequest {
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
    vi.mocked(createServerOrder).mockImplementation(async (order) => ({
      ...(order as object),
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

  it('formats the admin email date using the configured pattern and timezone', async () => {
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
    // 10:00 UTC is safely within 2026-06-16 in Europe/Riga regardless of DST offset.
    expect(html).toContain('2026-06-16')
  })
})
