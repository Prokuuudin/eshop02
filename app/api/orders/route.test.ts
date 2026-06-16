import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ createOrUpdateServerOrder: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/server-pricing', () => ({
  recomputeOrderPricing: vi.fn(),
}))

import { sendEmail } from '@/lib/mailer'
import { getServerUser } from '@/lib/server-auth'
import { createOrUpdateServerOrder } from '@/lib/orders-data-store'
import { getTemplates } from '@/lib/email-templates-server-store'
import { recomputeOrderPricing } from '@/lib/server-pricing'
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
    vi.mocked(createOrUpdateServerOrder).mockResolvedValue(undefined as never)
    vi.mocked(getTemplates).mockResolvedValue([])
    vi.mocked(recomputeOrderPricing).mockResolvedValue({
      items: [{ id: 'p1', price: 25, quantity: 2 }],
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
    expect(subject).toContain('ORD-001')
    expect(html).toContain('ORD-001')
    expect(html).toContain('Ivan')
    expect(html).toContain('64')
  })

  it('does not send admin email when CONTACT_TO is not set', async () => {
    delete process.env.CONTACT_TO
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await vi.waitFor(() => vi.mocked(sendEmail).mock.calls.length >= 1, { timeout: 500 }).catch(() => {})
    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    expect(adminCall).toBeUndefined()
  })
})
