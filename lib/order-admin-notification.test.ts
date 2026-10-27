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
import { buildAdminOrderNotificationEmail, sendAdminOrderNotificationEmail } from './order-admin-notification'

const ORDER: ServerOrder = {
  id: '1201',
  createdAt: '2026-10-27T18:30:00.000Z',
  items: [{
    id: 'p1', title: 'Шампунь', brand: 'Brand', image: '', category: 'hair',
    price: 25, rating: 5, stock: 10, quantity: 2,
  }],
  subtotal: 50,
  tax: 7.81,
  delivery: 5,
  deliveryMethod: 'courier_riga',
  paymentMethod: 'paysera',
  promoCode: 'SALE10',
  discount: 5,
  bonusSpent: 100,
  total: 49,
  firstName: 'Ivan',
  lastName: 'Petrov',
  email: 'buyer@example.test',
  phone: '+37120000000',
  address: 'Rencēnu iela 1',
  city: 'Rīga',
  country: 'LV',
  postalCode: 'LV-1001',
  paymentStatus: 'failed',
  paymentProvider: 'paysera',
}

describe('admin order notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CONTACT_TO', 'info@hairshop.lv')
    localeMock.mockResolvedValue({
      defaultLanguage: 'ru', dateFormat: 'DD.MM.YYYY', timezone: 'Europe/Riga', priceFormat: 'symbol_before',
    })
    sendEmailMock.mockResolvedValue(undefined)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('renders all required order data with human-readable Russian labels and discount details', async () => {
    const { subject, html } = await buildAdminOrderNotificationEmail(ORDER)

    expect(subject).toContain('1201')
    expect(html).toContain('27.10.2026 20:30')
    expect(html).toContain('Ivan Petrov')
    expect(html).toContain('+37120000000')
    expect(html).toContain('buyer@example.test')
    expect(html).toContain('Шампунь')
    expect(html).toContain('€25.00')
    expect(html).toContain('Курьер по Риге')
    expect(html).toContain('Латвия')
    expect(html).toContain('Онлайн-оплата Paysera')
    expect(html).toContain('Ошибка оплаты')
    expect(html).toContain('SALE10')
    expect(html).toContain('Скидка по промокоду SALE10')
    expect(html).toContain('Списано бонусов: 100')
    expect(html).toContain('−€1.00')
    expect(html).toContain('€49.00')
    expect(html).not.toContain('courier_riga')
    expect(html).not.toContain('>paysera<')
  })

  it('reads the recipient from CONTACT_TO and logs a PII-free success event', async () => {
    await expect(sendAdminOrderNotificationEmail(ORDER, {
      source: 'checkout', correlationId: 'correlation-1201',
    })).resolves.toBe('sent')

    expect(sendEmailMock).toHaveBeenCalledWith(
      'info@hairshop.lv', expect.stringContaining('1201'), expect.any(String),
      { correlationId: 'correlation-1201' },
    )
    const event = logMock.mock.calls.find(([payload]) => payload.event === 'order_admin_email_succeeded')?.[0]
    expect(event).toMatchObject({
      orderId: '1201', source: 'checkout', paymentStatus: 'failed', paymentProvider: 'paysera',
    })
    expect(JSON.stringify(event)).not.toContain('buyer@example.test')
    expect(JSON.stringify(event)).not.toContain('Ivan')
    expect(JSON.stringify(event)).not.toContain('info@hairshop.lv')
  })

  it('warns without sending when CONTACT_TO is missing', async () => {
    vi.stubEnv('CONTACT_TO', '')

    await expect(sendAdminOrderNotificationEmail(ORDER, { source: 'admin' }))
      .resolves.toBe('not_configured')

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      event: 'order_admin_email_failed', level: 'warn', orderId: '1201', source: 'admin',
      reason: 'contact_to_missing', recipientConfigured: false,
    }))
  })

  it('swallows SMTP errors, preserves the order status and logs only safe diagnostics', async () => {
    const snapshot = structuredClone(ORDER)
    sendEmailMock.mockRejectedValue(Object.assign(
      new Error('recipient buyer@example.test rejected; password=secret'),
      { responseCode: 550 },
    ))

    await expect(sendAdminOrderNotificationEmail(ORDER, { source: 'api_v1' }))
      .resolves.toBe('failed')

    expect(ORDER).toEqual(snapshot)
    const event = logMock.mock.calls.find(([payload]) => payload.event === 'order_admin_email_failed')?.[0]
    expect(event).toMatchObject({
      level: 'error', orderId: '1201', source: 'api_v1', reason: 'send_failed',
      errorType: 'Error', responseCode: 550,
    })
    expect(JSON.stringify(event)).not.toContain('buyer@example.test')
    expect(JSON.stringify(event)).not.toContain('secret')
  })
})
