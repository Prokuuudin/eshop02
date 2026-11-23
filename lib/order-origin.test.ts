import { describe, expect, it } from 'vitest'
import { isLegacyImportedOrder, NEW_SHOP_ORDER_WHERE } from '@/lib/order-origin'
import { newShopOrderSql } from '@/lib/order-origin-sql'

describe('isLegacyImportedOrder', () => {
  it.each([
    ['Payments.CheckMoneyOrder'], ['Payments.PaySera'], ['Payments.PurchaseOrder'], ['Payments.PayPalStandard'],
    ['Payments.CashOnDelivery'], ['Payments.Lateko'], ['DevPartner.Payments.PaySera'], ['unknown'],
  ])('recognises an imported nopCommerce order paid with %s', (paymentMethod) => {
    expect(isLegacyImportedOrder({ paymentProvider: null, paymentMethod })).toBe(true)
  })

  it.each([
    [{ paymentProvider: 'manual', paymentMethod: 'bank' }],
    [{ paymentProvider: 'manual', paymentMethod: 'cash' }],
    [{ paymentProvider: 'paysera', paymentMethod: 'paysera' }],
    [{ paymentProvider: 'stripe', paymentMethod: 'card' }],
  ])('keeps orders of the new shop: %o', (order) => {
    expect(isLegacyImportedOrder(order)).toBe(false)
  })

  it('needs both facts: a provider or a new-shop payment method keeps the order visible (fail-open)', () => {
    expect(isLegacyImportedOrder({ paymentProvider: 'manual', paymentMethod: 'Payments.PaySera' })).toBe(false)
    expect(isLegacyImportedOrder({ paymentProvider: null, paymentMethod: 'bank' })).toBe(false)
    expect(isLegacyImportedOrder({ paymentProvider: undefined, paymentMethod: 'paysera' })).toBe(false)
  })

  it('does not depend on the order number or id format', () => {
    expect(isLegacyImportedOrder({ paymentProvider: 'manual', paymentMethod: 'bank' })).toBe(false)
    expect(isLegacyImportedOrder({ paymentProvider: null, paymentMethod: 'Payments.PurchaseOrder' })).toBe(true)
  })
})

describe('NEW_SHOP_ORDER_WHERE / newShopOrderSql', () => {
  it('excludes exactly the rows isLegacyImportedOrder recognises', () => {
    expect(NEW_SHOP_ORDER_WHERE).toEqual({
      NOT: {
        paymentProvider: null,
        OR: [
          { paymentMethod: { startsWith: 'Payments.' } },
          { paymentMethod: { startsWith: 'DevPartner.' } },
          { paymentMethod: 'unknown' },
        ],
      },
    })
    expect(newShopOrderSql.sql.replace(/\s+/g, ' ')).toBe(
      'NOT (o."paymentProvider" IS NULL AND (o."paymentMethod" LIKE ? OR o."paymentMethod" LIKE ? OR o."paymentMethod" = ?))',
    )
    expect(newShopOrderSql.values).toEqual(['Payments.%', 'DevPartner.%', 'unknown'])
  })
})
