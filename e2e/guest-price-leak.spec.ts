import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { connectE2eDatabase } from './database'
import { E2E_CUSTOMER } from './helpers'

// Raw responses, as a scraper or a search engine reads them: rendered HTML with its meta tags and
// JSON-LD, the Next.js flight data inline in the document, and the same data requested as RSC.
const TEXT_AMOUNTS = ['7.74', '8,15', '9.20', '10.40']
const ADJUSTMENTS = ['46.04', '46,04', '42.5', '42,50']
const PRODUCT = 'e2e-price-text'
const VARIANT = 'e2e-price-variant'
const ORDER = 'e2e-price-order'
const BRAND = 'E2E Price Brand'

const expectNoLeak = (body: string, label: string): void => {
  for (const amount of [...TEXT_AMOUNTS, ...ADJUSTMENTS]) expect(body, `${label}: ${amount}`).not.toContain(amount)
  for (const field of ['priceAdjustment', 'bulkPricingTiers', 'pricePerUnit', 'campaignOffers']) expect(body, `${label}: ${field}`).not.toContain(field)
  expect(body, `${label}: price field`).not.toMatch(/\\?"(?:price|oldPrice)\\?":\s*\\?"?\d/)
}
const expectVisibleContains = (body: string, text: string, label: string): void => {
  expect(body, `${label} should still hold "${text}"`).toContain(text)
}

test.beforeAll(async () => {
  const client = await connectE2eDatabase()
  try {
    const insert = `INSERT INTO "Product" (id, title, "titleEn", "titleLv", brand, category, image, price, "oldPrice", stock, "isActive", badges, description, "metaTitle", "metaDescription", "ogAlt", "technicalSpecs", "bulkPricingTiers", "updatedAt")
      VALUES ($1,$2,$3,$4,'${BRAND}','hair','/placeholder.png',$5,$6,100,true,ARRAY['sale'],$7,$8,$9,$10,$11,$12,now())
      ON CONFLICT (id) DO NOTHING`
    await client.query(insert, [PRODUCT, 'E2E краска', 'E2E dye', 'E2E krāsa', 31.99, 39.99,
      'Стойкая краска. Всего за 8,15 €. Объём 60 мл.', 'Краска за 9.20 €', 'Matu krāsa tikai par 7.74 €. Matu krāsa 60ml.', 'Krāsa 10.40 EUR',
      JSON.stringify({ __descriptionEn: 'Great dye. Only €9.20 today. Lasts long.', __descriptionLv: 'Laba krāsa. Tikai 10.40 eiro. Ilgi turas.' }),
      JSON.stringify([{ quantity: 10, pricePerUnit: 25.5 }])])
    await client.query(insert, [VARIANT, 'E2E набор', 'E2E set', 'E2E komplekts', 781, 900, null, null, null, null,
      JSON.stringify({ __variantGroupsJson: JSON.stringify([{ name: 'Bāze', required: true, displayType: 'imageSquares', options: [{ value: 'XT', priceAdjustment: -42.5, image: '/placeholder.png' }, { value: 'XM', priceAdjustment: 46.04, image: '/placeholder.png' }] }]) }),
      null])
    // Bestsellers are computed from orders, and the home page shows them: without an order the home
    // page would not carry this product, and its check would prove nothing.
    await client.query(`INSERT INTO "Order" (id, "createdAt", items, subtotal, tax, delivery, total, "deliveryMethod", "paymentMethod", "firstName", "lastName", email, phone, address, city)
      VALUES ('${ORDER}', now(), $1, 0, 0, 0, 0, 'pickup', 'cash', 'E2E', 'Price', 'e2e-price@example.test', '1', 'x', 'y')
      ON CONFLICT (id) DO NOTHING`, [JSON.stringify([{ id: PRODUCT, quantity: 1000 }])])
    // Home lists stay cached for minutes, and the server rendered them empty before this seed ran. The
    // active campaign set is part of their cache key, so a new campaign selects a fresh entry.
    await client.query(`INSERT INTO "KeyValueSetting" (key, value, "updatedAt") VALUES ('promo-campaigns', $1, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`, [JSON.stringify([{
      id: `e2e-price-${Date.now()}`, name: 'E2E', description: '', type: 'discount', discountPercent: 10,
      startDate: '2020-01-01', endDate: '2099-12-31', active: true, targetCategories: [], targetSubcategories: [],
      targetBrands: [BRAND], minOrderAmount: 0, createdAt: '2020-01-01', updatedAt: '2020-01-01',
    }])])
  } finally {
    await client.end()
  }
})

test.afterAll(async () => {
  const client = await connectE2eDatabase()
  try {
    await client.query(`DELETE FROM "KeyValueSetting" WHERE key = 'promo-campaigns'`)
    await client.query('DELETE FROM "Order" WHERE id = $1', [ORDER])
    await client.query('DELETE FROM "Product" WHERE id = ANY($1)', [[PRODUCT, VARIANT]])
  } finally {
    await client.end()
  }
})

for (const [lang, prefix, description] of [['ru', '', 'Объём 60 мл.'], ['lv', '/lv', 'Ilgi turas.'], ['en', '/en', 'Lasts long.']] as const) {
  test.describe(`guest, ${lang}`, () => {
    let guest: APIRequestContext
    test.beforeEach(async ({ baseURL }) => { guest = await playwrightRequest.newContext({ baseURL }) })
    test.afterEach(async () => { await guest.dispose() })

    test('product page: no price in HTML, meta tags, JSON-LD or flight data', async () => {
      const response = await guest.get(`${prefix}/product/${PRODUCT}`)
      expect(response.status()).toBe(200)
      const html = await response.text()
      expectNoLeak(html, `${lang} product HTML`)
      expectVisibleContains(html, description, `${lang} product HTML`)

      const metaTags = html.match(/<meta[^>]+>/gu)?.join('\n') ?? ''
      for (const amount of TEXT_AMOUNTS) expect(metaTags).not.toContain(amount)
      const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)].map((match) => match[1]).join('\n')
      expect(jsonLd).toContain('"@type":"Product"')
      expect(jsonLd).not.toContain('"offers"')
      for (const amount of TEXT_AMOUNTS) expect(jsonLd).not.toContain(amount)
    })

    test('product page requested as an RSC payload holds no price either', async () => {
      const response = await guest.get(`${prefix}/product/${PRODUCT}`, { headers: { RSC: '1' } })
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('text/x-component')
      expectNoLeak(await response.text(), `${lang} product RSC`)
    })

    test('variant page: names stay, adjustments are gone from HTML and payload', async () => {
      for (const headers of [{}, { RSC: '1' }] as Array<Record<string, string>>) {
        const body = await (await guest.get(`${prefix}/product/${VARIANT}`, { headers })).text()
        expectNoLeak(body, `${lang} variant`)
        expect(body).toContain('Bāze')
      }
    })

    test('home and catalog carry the products without any price', async () => {
      const home = await (await guest.get(prefix || '/')).text()
      expectNoLeak(home, `${lang} home`)
      expect(home).toContain(PRODUCT)
      const catalog = await (await guest.get(`${prefix}/catalog`)).text()
      expectNoLeak(catalog, `${lang} catalog`)
      expect(catalog).toContain(PRODUCT)
    })
  })
}

test.describe('rendered in a browser', () => {
  test('a guest can choose a variant and sees no amount', async ({ page }) => {
    await page.goto(`/lv/product/${VARIANT}`)
    const option = page.getByRole('radio').filter({ hasText: 'XM' })
    await expect(option).toBeVisible()
    await option.click()
    const text = await page.locator('body').innerText()
    for (const amount of ADJUSTMENTS) expect(text).not.toContain(amount)
  })

  test('a client sees the variant adjustment on the same page', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { identifier: E2E_CUSTOMER.cardNumber, password: E2E_CUSTOMER.password } })
    expect(login.ok()).toBeTruthy()
    await page.goto(`/lv/product/${VARIANT}`)
    await expect(page.locator('body')).toContainText('46,04')
  })
})

test.describe('signed-in client', () => {
  test('still sees the price, the adjustments and the untouched text', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { identifier: E2E_CUSTOMER.cardNumber, password: E2E_CUSTOMER.password } })
    expect(login.ok()).toBeTruthy()

    const product = await (await page.request.get(`/lv/product/${PRODUCT}`)).text()
    expect(product).toContain('31.99')
    expect(product).toContain('8,15 €')

    const variant = await (await page.request.get(`/lv/product/${VARIANT}`)).text()
    expect(variant).toContain('781')
    expect(variant).toContain('46.04')
    expect(variant).toContain('priceAdjustment')

    const home = await (await page.request.get('/lv')).text()
    expect(home).toContain(PRODUCT)
    expect(home).toContain('31.99')
  })

  test('meta tags stay free of prices even when signed in', async ({ page }) => {
    await page.request.post('/api/auth/login', { data: { identifier: E2E_CUSTOMER.cardNumber, password: E2E_CUSTOMER.password } })
    const html = await (await page.request.get(`/product/${PRODUCT}`)).text()
    const metaTags = html.match(/<meta[^>]+>/gu)?.join('\n') ?? ''
    for (const amount of TEXT_AMOUNTS) expect(metaTags).not.toContain(amount)
    expect(metaTags).toContain('Matu krāsa 60ml.')
  })
})
