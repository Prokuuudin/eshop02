import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendEmailMock, logMock, localeMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  logMock: vi.fn(),
  localeMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: logMock }))
vi.mock('@/lib/locale-config-server-store', () => ({ getLocaleConfig: localeMock }))

import type { ServerOrder } from '@/lib/orders-data-store'
import { sendAdminOrderNotificationEmail, type AdminOrderNotificationSource } from '@/lib/order-admin-notification'

const ORDER: ServerOrder = {
  id: 'integration-1202', createdAt: '2026-10-27T18:30:00.000Z',
  items: [{ id: 'p1', title: 'Product', brand: 'Brand', image: '', category: 'hair', price: 10, rating: 0, stock: 1, quantity: 1 }],
  subtotal: 10, tax: 1.74, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'bank',
  discount: 0, total: 10, firstName: 'Buyer', lastName: 'Test', email: 'buyer@example.test',
  phone: '+37120000000', address: 'Rencēnu iela 10A', city: 'Rīga', country: 'LV',
  paymentStatus: 'unpaid', paymentProvider: 'manual', stockReservationStatus: 'committed',
}

describe('order notification integration boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CONTACT_TO', 'info@hairshop.lv')
    localeMock.mockResolvedValue({ dateFormat: 'DD.MM.YYYY', timezone: 'Europe/Riga' })
    sendEmailMock.mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['checkout', 'admin', 'api_v1'] as AdminOrderNotificationSource[])(
    'delivers the shared template for a new %s order and records success',
    async source => {
      await expect(sendAdminOrderNotificationEmail(ORDER, { source, correlationId: `cid-${source}` }))
        .resolves.toBe('sent')
      expect(sendEmailMock).toHaveBeenLastCalledWith(
        'info@hairshop.lv', expect.stringContaining(ORDER.id), expect.stringContaining('Банковский перевод'),
        { correlationId: `cid-${source}` },
      )
      expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
        event: 'order_admin_email_succeeded', orderId: ORDER.id, source,
      }))
    },
  )

  it('keeps the committed order unchanged when the SMTP boundary fails', async () => {
    const snapshot = structuredClone(ORDER)
    sendEmailMock.mockRejectedValue(new Error('smtp unavailable'))
    await expect(sendAdminOrderNotificationEmail(ORDER, { source: 'checkout' })).resolves.toBe('failed')
    expect(ORDER).toEqual(snapshot)
  })
})
