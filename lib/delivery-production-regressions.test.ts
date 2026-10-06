import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_COMMERCE_SETTINGS } from './commerce-settings'
import { validateOrderDelivery } from './validate-order-delivery'
import { calcDeliveryFee } from './delivery'
import { getDeliveryLocations } from './delivery-locations'
import { isOrderTaxIncluded, extractVat } from './tax'
import { pointsToEuros } from './bonus-program'

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  order: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  product: { updateMany: vi.fn() },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } }))
import { createOrderPaymentSession, updateServerOrderPayment } from './orders-data-store'

const settings = DEFAULT_COMMERCE_SETTINGS
const courier = { deliveryMethod: 'courier', country: 'LV', address: 'Street 1', city: 'Riga', postalCode: 'LV-1001' }

describe('production delivery invariants shared by every order boundary', () => {
  it.each(['unknown', 'dpd', 'expresspasts', 'venipak_courier', 'unisend_courier'])('rejects unavailable method %s', deliveryMethod => {
    expect(() => validateOrderDelivery({ ...courier, deliveryMethod }, settings)).toThrow()
  })
  it.each(['address', 'city', 'postalCode'])('rejects courier without %s', field => {
    expect(() => validateOrderDelivery({ ...courier, [field]: ' ' }, settings)).toThrow('missing_delivery_address')
  })
  it('rejects unknown country and foreign pickup', () => {
    expect(() => validateOrderDelivery({ ...courier, country: 'DE' }, settings)).toThrow()
    expect(() => validateOrderDelivery({ deliveryMethod: 'pickup', country: 'LT', pickupStoreId: 'riga-office' }, settings)).toThrow()
  })
  it.each(['post', 'venipak', 'unisend'])('rejects missing and forged %s lockers', deliveryMethod => {
    for (const deliveryLocationId of [undefined, 'forged']) expect(() => validateOrderDelivery({ deliveryMethod, deliveryLocationId }, settings)).toThrow()
  })
  it.each(['LV', 'LT', 'EE'] as const)('validates all production destinations and tariffs in %s', country => {
    expect(validateOrderDelivery({ ...courier, country }, settings).country).toBe(country)
    expect(calcDeliveryFee('courier', 60, country, settings)).toBe(country === 'LV' ? 10 : 15)
    for (const method of ['post', 'venipak', 'unisend']) {
      const locker = getDeliveryLocations(method, country)[0]
      expect(locker).toBeDefined()
      const resolved = validateOrderDelivery({ deliveryMethod: method, country, deliveryLocationId: locker.id, address: 'forged' }, settings)
      expect(resolved.deliveryLocation).toEqual(locker)
      expect(resolved.address).toBe(locker.address)
      expect(resolved.pickupStoreId).toBeUndefined()
    }
  })
  it('rejects wrong provider, country and disabled settings', () => {
    const locker = getDeliveryLocations('post', 'LT')[0]
    expect(() => validateOrderDelivery({ deliveryMethod: 'post', country: 'LV', deliveryLocationId: locker.id }, settings)).toThrow()
    expect(() => validateOrderDelivery({ deliveryMethod: 'venipak', country: 'LT', deliveryLocationId: locker.id }, settings)).toThrow()
    const disabled = structuredClone(settings); disabled.delivery.courier_latvia.enabled = false
    expect(() => validateOrderDelivery(courier, disabled)).toThrow()
  })
  it('requires a valid pickup and derives its address, clearing stale locker fields', () => {
    for (const pickupStoreId of [undefined, 'fake']) expect(() => validateOrderDelivery({ deliveryMethod: 'pickup', pickupStoreId }, settings)).toThrow()
    const a = validateOrderDelivery({ deliveryMethod: 'pickup', pickupStoreId: 'riga-office', deliveryLocationId: '9192', address: 'forged' }, settings)
    const b = validateOrderDelivery({ deliveryMethod: 'pickup', pickupStoreId: 'imanta' }, settings)
    expect(a.address).not.toBe('forged'); expect(a.address).not.toBe(b.address)
    expect(a.deliveryLocation).toBeUndefined(); expect(a.postalCode).toBeUndefined()
    expect(validateOrderDelivery({ ...courier, pickupStoreId: a.pickupStoreId }, settings).pickupStoreId).toBeUndefined()
  })
})

describe('VAT and bonus units', () => {
  it.each([[60, 0, 10, 100, 69], [60, 0, 10, 0, 70], [60, 10, 10, 100, 59], [60, 0, 10, 7000, 0], [10, 0, 0, 6000, 0], [60, 0, 10, 1, 69.99]])('preserves totals across non-economic edits', (subtotal, discount, delivery, bonusSpent, total) => {
    const order = { subtotal, discount, delivery, bonusSpent, total, tax: extractVat(subtotal - discount) }
    expect(isOrderTaxIncluded(order)).toBe(true)
    const after = Math.max(0, Math.round((subtotal - discount + delivery - pointsToEuros(bonusSpent) + (isOrderTaxIncluded(order) ? 0 : order.tax)) * 100) / 100)
    expect(after).toBe(total)
  })
})

describe('current payment and stock invariants', () => {
  let row: Record<string, unknown>
  beforeEach(() => {
    vi.clearAllMocks()
    row = { id: 'o1', total: 100, paymentMethod: 'paysera', paymentSessionId: 'session-100', paymentStatus: 'unpaid', stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 600_000), items: [] }
    tx.order.findUnique.mockImplementation(async () => row)
    tx.order.updateMany.mockImplementation(async ({ data }) => { Object.assign(row, data); return { count: 1 } })
    tx.order.update.mockImplementation(async ({ data }) => { Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return row })
  })
  const paid = (sessionId = 'session-100', amount = 10000, currency = 'EUR') => updateServerOrderPayment('o1', { paymentStatus: 'paid', paymentProvider: 'paysera' }, { sessionId, amount, amountPaid: amount, currency })
  it('commits reserved stock and makes duplicate callbacks idempotent', async () => {
    await paid(); expect(row.paymentStatus).toBe('paid'); expect(row.stockReservationStatus).toBe('committed')
    await paid(); expect(tx.order.updateMany).toHaveBeenCalledTimes(1)
  })
  it('rejects stale session after admin invalidation, then accepts a new session on current total', async () => {
    row.total = 120; row.paymentSessionId = null
    await expect(paid()).rejects.toThrow('invalid_payment_session')
    await createOrderPaymentSession('o1', async order => {
      expect(order.total).toBe(120); return { payseraOrderId: 'session-120', paymentUrl: 'https://gateway.test/pay' }
    })
    await expect(paid('session-100')).rejects.toThrow()
    await paid('session-120', 12000); expect(row.paymentStatus).toBe('paid')
  })
  it.each([[9999, 'EUR'], [10000, 'USD']])('rejects wrong amount/currency %s %s', async (amount, currency) => {
    await expect(paid('session-100', amount, currency)).rejects.toThrow('invalid_payment_amount')
    expect(tx.order.updateMany).not.toHaveBeenCalled()
  })
  it('rejects missing evidence and a partially paid amount', async () => {
    await expect(updateServerOrderPayment('o1', { paymentStatus: 'paid', paymentProvider: 'paysera' })).rejects.toThrow()
    await expect(updateServerOrderPayment('o1', { paymentStatus: 'paid', paymentProvider: 'paysera' }, {
      sessionId: 'session-100', amount: 10000, amountPaid: 5000, currency: 'EUR',
    })).rejects.toThrow('invalid_payment_amount')
    expect(tx.order.update).not.toHaveBeenCalled()
  })
  it('does not release committed stock on a delayed cancel event', async () => {
    await paid()
    await updateServerOrderPayment('o1', { paymentStatus: 'failed', paymentProvider: 'paysera' }, { sessionId: 'session-100' })
    expect(row.paymentStatus).toBe('paid'); expect(row.stockReservationStatus).toBe('committed')
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
  it('withholds a link when reservation expires during gateway creation', async () => {
    await expect(createOrderPaymentSession('o1', async () => {
      row.stockReservedUntil = new Date(Date.now() - 1)
      return { payseraOrderId: 'expired', paymentUrl: 'https://gateway.test/pay' }
    })).rejects.toThrow('stock_reservation_expired')
    expect(tx.order.update).not.toHaveBeenCalled()
    expect(tx.$queryRaw).toHaveBeenCalledBefore(tx.order.findUnique)
  })
  it('allows payment of committed staff stock without requiring an expiring reservation', async () => {
    row.stockReservationStatus = 'committed'; row.stockReservedUntil = null
    await createOrderPaymentSession('o1', async () => ({ payseraOrderId: 'staff-payment', paymentUrl: 'https://gateway.test/pay' }))
    await paid('staff-payment')
    expect(row.paymentStatus).toBe('paid'); expect(row.stockReservationStatus).toBe('committed')
  })
  it.each(['released', 'expired'])('rejects %s callbacks and retries even if product stock is sufficient', async state => {
    if (state === 'released') row.stockReservationStatus = 'released'
    else row.stockReservedUntil = new Date(Date.now() - 1000)
    await expect(paid()).rejects.toThrow('stock_reservation_expired')
    const gateway = vi.fn()
    await expect(createOrderPaymentSession('o1', gateway)).rejects.toThrow('stock_reservation_expired')
    expect(gateway).not.toHaveBeenCalled(); expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
})
