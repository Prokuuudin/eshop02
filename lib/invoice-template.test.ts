import { describe, it, expect } from 'vitest'
import { amountInWords, buildInvoiceHtml } from './invoice-template'
import type { Order } from './orders-store'

const order = {
  id: '1001',
  items: [
    {
      id: '12483',
      lineKey: 'k',
      title: 'KALLOS KJMN ARGAN шампунь для окрашенных волос 5000мл',
      brand: 'KALLOS',
      price: 25,
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
  subtotal: 50,
  discount: 0,
  tax: 8.68,
  delivery: 5,
  total: 55,
  createdAt: '2026-07-18T10:00:00.000Z',
  status: 'processing',
  deliveryMethod: 'courier',
  paymentMethod: 'card',
} as unknown as Order

describe('buildInvoiceHtml', () => {
  it('matches the reference invoice sections and adds the amount in words', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('Pasūtījuma numurs: #1001')
    expect(html).toContain('Pasūtījuma datums: 18.07.2026')
    expect(html).not.toContain('Pasūtījuma datums: 18.07.2026.')
    expect(html).toContain('Preču izsniedzējs')
    expect(html).toContain('Nosaukums')
    expect(html).toContain('Artikuls')
    expect(html).toContain('Maksātājs')
    expect(html).toContain('Saņēmējs')
    expect(html).toContain('Maksāšanas veids: Apmaksa ar karti')
    expect(html).toContain('Kopā bez PVN:</td><td>41.32 €')
    expect(html).toContain('class="brand-logo" src="/invoice-logo.png"')
    expect(html).toContain('class="order-number"')
    expect(html).toContain('class="seller-name">SIA MIKS PLUS')
    expect(html).toContain('Konts: LV 66 HABA 0551 0366 0410 7<br/>SWIFT: HABALV22')
    expect(html).toContain('class="method-line">Maksāšanas veids: Apmaksa ar karti')
    expect(html).toContain('class="payment-reference"')
    expect(html).toContain('text-align:center;vertical-align:middle')
    expect(html).toContain('Banka: AS Swedbank')
    expect(html).toContain('Maksātājs:</div>')
    expect(html).toContain('Saņēmējs:</div>')
    expect(html).toContain('Adrese: Brīvības iela 1, Rīga, LV-1010')
    expect(html).toContain('Apmaksājot, lūdzu, norādiet rēķina numuru: 1001')
    expect(html).toContain('Rēķins sagatavots elektroniskā veidā un ir autorizēts 100000001')
    expect(html).toContain('Summa vārdiem: Piecdesmit pieci eiro un 00 centi')
    expect(html).toContain('Nodokļu maksātāja kods: LV 40103351370')
    expect(html).toContain('Konts: LV 66 HABA 0551 0366 0410 7')
  })

  it('converts euro totals to Latvian and English words', () => {
    expect(amountInWords(16.14)).toBe('Sešpadsmit eiro un 14 centi')
    expect(amountInWords(1021.05)).toBe('Viens tūkstotis divdesmit viens eiro un 05 centi')
    expect(amountInWords(16.14, 'en')).toBe('Sixteen euros and 14 cents')
  })

  it('renders entirely in Latvian regardless of order snapshot language', () => {
    const html = buildInvoiceHtml(order, {
      '12483': 'KALLOS KJMN ARGAN šampūns krāsotiem matiem 5000ml',
    })
    expect(html).toContain('<html lang="lv">')
    expect(html).toContain('RĒĶINS')
    expect(html).toContain('PVN 21%')
    expect(html).toContain('šampūns krāsotiem matiem')
    expect(html).not.toContain('шампунь')
  })

  it('renders order amounts as real euros, not divided by 100', () => {
    const html = buildInvoiceHtml(order)
    // order.total is already whole-euro decimal (Decimal(12,2) in the DB) — 55, not 5500.
    expect(html).toContain('55.00 €')
    expect(html).toContain('50.00 €')
    expect(html).not.toContain('0.55 €')
  })

  it('includes seller requisites with Latvian address', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('SIA MIKS PLUS')
    expect(html).toContain('Rencēnu iela 10A, Rīga, Latvija, LV-1073')
    expect(html).toContain('LV 40103351370')
  })

  it('falls back to the snapshot title when no Latvian title is known', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('шампунь')
  })

  it('replaces a legacy Russian pickup-store snapshot with the Latvian store address', () => {
    const pickupOrder = {
      ...order,
      deliveryMethod: 'pickup',
      address: 'Рига (Иманта) — Аннинмуйжас булварис 82, Рига, LV-1029, Латвия',
      city: 'Рига',
      postalCode: undefined,
    } as unknown as Order
    const html = buildInvoiceHtml(pickupOrder)
    expect(html).toContain('Rīga (Imanta) — Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija')
    expect(html).not.toContain('Аннинмуйжас')
    expect(html).not.toContain('>Рига')
  })

  it('resolves the pickup store by pickupStoreId when present', () => {
    const pickupOrder = {
      ...order,
      deliveryMethod: 'pickup',
      pickupStoreId: 'riga-office',
      address: 'что-то устаревшее',
      city: 'Рига',
    } as unknown as Order
    const html = buildInvoiceHtml(pickupOrder)
    expect(html).toContain('Rīgas birojs — Rencēnu iela 10a, Rīga, LV-1073, Latvija')
  })

  it('keeps the customer-entered address for courier orders', () => {
    const html = buildInvoiceHtml(order)
    expect(html).toContain('Brīvības iela 1')
    expect(html).toContain('LV-1010')
  })

  it('renders English labels and titles when lang=en', () => {
    const html = buildInvoiceHtml(
      order,
      { '12483': 'KALLOS KJMN ARGAN shampoo for coloured hair 5000ml' },
      'en'
    )
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('INVOICE')
    expect(html).toContain('Goods supplier:</div>')
    expect(html).toContain('VAT (21%)')
    expect(html).toContain('shampoo for coloured hair')
    expect(html).not.toContain('шампунь')
    expect(html).not.toContain('RĒĶINS')
  })

  it('keeps seller and pickup addresses Latvian in the English invoice', () => {
    const pickupOrder = {
      ...order,
      deliveryMethod: 'pickup',
      pickupStoreId: 'riga-office',
      address: 'что-то устаревшее',
      city: 'Рига',
    } as unknown as Order
    const html = buildInvoiceHtml(pickupOrder, undefined, 'en')
    expect(html).toContain('Rencēnu iela 10A, Rīga, Latvija, LV-1073')
    expect(html).toContain('Rīgas birojs — Rencēnu iela 10a, Rīga, LV-1073, Latvija')
  })
})

describe('buildInvoiceHtml payer block', () => {
  it('shows the personal code for an individual order', () => {
    const html = buildInvoiceHtml({
      ...order,
      legalDetails: { customerType: 'individual', personalCode: '010101-12345' },
    } as unknown as Order)

    expect(html).toContain('Personas kods: 010101-12345')
    expect(html).toContain('Jānis Bērziņš')
    expect(html).not.toContain('Uzņēmums')
  })

  it('shows company details instead of the personal name for a company order', () => {
    const html = buildInvoiceHtml({
      ...order,
      legalDetails: {
        customerType: 'company',
        companyName: 'SIA Test',
        regNumber: '40001234567',
        vatNumber: 'LV40001234567',
        legalAddress: 'Rencēnu iela 10A, Rīga, LV-1073',
        bankName: 'Swedbank',
        iban: 'LV80BANK0000435195001',
      },
    } as unknown as Order)

    expect(html).toContain('Uzņēmums: <strong>SIA Test</strong>')
    expect(html).toContain('Reģistrācijas numurs: 40001234567')
    expect(html).toContain('PVN numurs: LV40001234567')
    expect(html).toContain('Rencēnu iela 10A, Rīga, LV-1073')
    expect(html).toContain('Swedbank')
    expect(html).toContain('Kontaktpersona: Jānis Bērziņš')
    expect(html).not.toContain('Personas kods')
  })

  it('omits the VAT line for a company order without a VAT number', () => {
    const html = buildInvoiceHtml({
      ...order,
      legalDetails: {
        customerType: 'company',
        companyName: 'SIA Test',
        regNumber: '40001234567',
        legalAddress: 'Rencēnu iela 10A, Rīga, LV-1073',
        bankName: 'Swedbank',
        iban: 'LV80BANK0000435195001',
      },
    } as unknown as Order)

    expect(html).not.toContain('PVN numurs:')
  })

  it('falls back to plain name/address for legacy orders with no legalDetails', () => {
    const html = buildInvoiceHtml(order)

    expect(html).toContain('Jānis Bērziņš')
    expect(html).not.toContain('Personas kods')
    expect(html).not.toContain('Uzņēmums')
  })

  it('escapes company-controlled fields', () => {
    const html = buildInvoiceHtml({
      ...order,
      legalDetails: {
        customerType: 'company',
        companyName: '<img src=x onerror=alert(1)>',
        regNumber: '1',
        legalAddress: 'x',
        bankName: 'x',
        iban: 'x',
      },
    } as unknown as Order)

    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain('&lt;img src=x onerror')
  })
})
