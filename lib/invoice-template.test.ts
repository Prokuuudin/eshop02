import { describe, it, expect } from 'vitest'
import { buildInvoiceHtml } from './invoice-template'
import type { Order } from './orders-store'

const order = {
  id: '1001',
  items: [
    {
      id: '12483',
      lineKey: 'k',
      title: 'KALLOS KJMN ARGAN шампунь для окрашенных волос 5000мл',
      brand: 'KALLOS',
      price: 2500,
      quantity: 2,
      sku: 'K-1',
    },
  ],
  firstName: 'Jānis',
  lastName: 'Bērziņš',
  email: 'j@b.lv',
  phone: '+371 20000000',
  address: 'Brīvības iela 1',
  city: 'Rīga',
  postalCode: 'LV-1010',
  subtotal: 5000,
  discount: 0,
  tax: 868,
  delivery: 500,
  total: 5500,
  createdAt: '2026-07-18T10:00:00.000Z',
  status: 'processing',
  deliveryMethod: 'courier',
  paymentMethod: 'card',
} as unknown as Order

describe('buildInvoiceHtml', () => {
  it('renders entirely in Latvian regardless of order snapshot language', () => {
    const html = buildInvoiceHtml(order, {
      '12483': 'KALLOS KJMN ARGAN šampūns krāsotiem matiem 5000ml',
    })
    expect(html).toContain('<html lang="lv">')
    expect(html).toContain('RĒĶINS')
    expect(html).toContain('PVN (21%)')
    expect(html).toContain('šampūns krāsotiem matiem')
    expect(html).not.toContain('шампунь')
  })

  it('includes seller requisites with Latvian address', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('SIA Miks Plus')
    expect(html).toContain('Rencēnu iela 10A, Rīga, Latvija, LV-1073')
    expect(html).toContain('LV40103351370')
  })

  it('falls back to the snapshot title when no Latvian title is known', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('шампунь')
  })
})
