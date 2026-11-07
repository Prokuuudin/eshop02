import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { Client } from 'pg'
import { resolveE2eDatabaseUrl } from '../scripts/e2e-database-guard'
import { E2E_ADMIN, E2E_CUSTOMER, loginAs } from './helpers'

// A chair with base options that change the price, as in the production catalog.
const PRODUCT = 'e2e-variant-chair'
const GROUPS = [
  { name: 'Bāze', required: true, displayType: 'imageSquares', options: [
    { value: 'BASE XT', priceAdjustment: -42.5, image: '/placeholder.png' },
    { value: 'BASE XM', priceAdjustment: 46.04, image: '/placeholder.png' },
    { value: 'BASE XC', priceAdjustment: 0, preselected: true, image: '/placeholder.png' },
  ] },
]
let openedCheckoutGate = false
// A browser always sends Origin on a POST; the CSRF guard refuses a mutating request without it.
const postOrder = (page: Page, baseURL: string | undefined, body: unknown) =>
  page.request.post('/api/orders', { data: body, headers: { origin: new URL(baseURL ?? 'http://localhost:3005').origin } })

const orderBody = (selectedVariants: unknown, extra: Record<string, unknown> = {}) => ({
  order: {
    firstName: 'E2E', lastName: 'Variant', email: 'e2e-variant@example.test', phone: '+37120000000',
    address: 'Rencēnu 10A', city: 'Riga', postalCode: 'LV-1073', country: 'LV', legalDetails: { customerType: 'individual' },
    deliveryMethod: 'pickup', pickupStoreId: 'riga-office', paymentMethod: 'bank', language: 'lv',
    items: [{ id: PRODUCT, quantity: 1, selectedVariants }], ...extra,
  },
})

test.beforeAll(async () => {
  const client = new Client({ connectionString: resolveE2eDatabaseUrl(process.env) })
  await client.connect()
  try {
    await client.query(`INSERT INTO "Product" (id, title, brand, category, image, price, stock, "isActive", badges, "technicalSpecs", "updatedAt")
      VALUES ($1, 'PANDA GALAXY BASIC', 'E2E Chairs', 'equipment', '/placeholder.png', 781, 100, true, '{}', $2, now())
      ON CONFLICT (id) DO UPDATE SET "isActive" = true, stock = 100, price = 781, "technicalSpecs" = EXCLUDED."technicalSpecs"`,
      [PRODUCT, JSON.stringify({ __variantGroupsJson: JSON.stringify(GROUPS) })])
    // Checkout is closed (fail-closed) until the GrinS gate says otherwise; an empty test database has no gate.
    const gate = await client.query(`INSERT INTO "KeyValueSetting" (key, value, "updatedAt") VALUES ('grins-prices-only-maintenance', '{"checkoutClosed": false}', now())
      ON CONFLICT (key) DO NOTHING RETURNING key`)
    openedCheckoutGate = (gate.rowCount ?? 0) > 0
  } finally {
    await client.end()
  }
})

test.afterAll(async () => {
  const client = new Client({ connectionString: resolveE2eDatabaseUrl(process.env) })
  await client.connect()
  try {
    // Orders stay (stock ledger and outbox rows point at them); the product just leaves the shop.
    await client.query('UPDATE "Product" SET "isActive" = false WHERE id = $1', [PRODUCT])
    if (openedCheckoutGate) await client.query(`DELETE FROM "KeyValueSetting" WHERE key = 'grins-prices-only-maintenance'`)
  } finally {
    await client.end()
  }
})

test('a client is charged the base plus the chosen option, whatever the request claims', async ({ page, baseURL }) => {
  await loginAs(page, E2E_CUSTOMER)
  const forged = [{ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: -700 }]
  const response = await postOrder(page, baseURL, orderBody(forged, { total: 1, subtotal: 1 }))
  expect(response.status()).toBe(200)
  const { orderId, order } = await response.json() as { orderId: string; order: { total: number; items: Array<{ price: number; variantLabel: string }> } }
  expect(order.total).toBe(827.04)
  expect(order.items[0]).toMatchObject({ price: 827.04, variantLabel: 'Bāze: BASE XM' })

  for (const prefix of ['', '/lv', '/en']) {
    await page.goto(`${prefix}/order/${orderId}`)
    await expect(page.locator('#main-content')).toContainText('BASE XM', { timeout: 30_000 })
    await expect(page.locator('#main-content')).toContainText(/827[,.]04/)
  }
})

test('an option the chair does not have, or no base at all, is refused', async ({ page, baseURL }) => {
  await loginAs(page, E2E_CUSTOMER)
  for (const selectedVariants of [[{ groupName: 'Bāze', value: 'BASE XZ' }], undefined]) {
    const response = await postOrder(page, baseURL, orderBody(selectedVariants))
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_variant' })
  }
})

test('a guest cannot order, even though the product page offers the choice', async ({ baseURL }) => {
  const guest = await playwrightRequest.newContext({ baseURL })
  try {
    const page = await guest.get(`/lv/product/${PRODUCT}`)
    expect(page.status()).toBe(200)
    const response = await guest.post('/api/orders', { data: orderBody([{ groupName: 'Bāze', value: 'BASE XM' }]), headers: { origin: new URL(baseURL ?? 'http://localhost:3005').origin } })
    expect(response.status()).toBe(401)
  } finally {
    await guest.dispose()
  }
})

test('staff see the ordered configuration in the admin order list', async ({ page, baseURL }) => {
  await loginAs(page, E2E_CUSTOMER)
  const placed = await postOrder(page, baseURL, orderBody([{ groupName: 'Bāze', value: 'BASE XT' }]))
  expect(placed.status()).toBe(200)
  const { orderId } = await placed.json() as { orderId: string }
  await page.context().clearCookies()

  await loginAs(page, E2E_ADMIN)
  // Server gate: the DB session above. Client stores read the profile from localStorage.
  await page.addInitScript((admin) => {
    window.localStorage.setItem('eshop_current_user', JSON.stringify(admin))
  }, { id: E2E_ADMIN.id, email: E2E_ADMIN.email, name: E2E_ADMIN.name, platformRole: E2E_ADMIN.platformRole })
  await page.goto('/lv/admin/orders')
  const row = page.locator('button[aria-expanded]').filter({ hasText: orderId })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator('#main-content')).toContainText('BASE XT')

  // Staff add the chair once more: the base must be chosen before the line can be added.
  await page.getByRole('button', { name: /Rediģēt/ }).first().click()
  await page.getByPlaceholder(/Pievienot preci|Добавить товар|Add product/).fill('PANDA')
  // The search result, not the order row that also names the chair.
  await page.getByRole('button', { name: /PANDA GALAXY BASIC/ }).filter({ hasText: '€781.00' }).click()
  const picker = page.getByTestId('order-edit-variant-picker')
  const add = picker.getByRole('button', { name: 'Pievienot pasūtījumam' })
  await expect(picker).toBeVisible()
  await picker.getByRole('combobox', { name: 'Bāze' }).click()
  await page.getByRole('option', { name: /BASE XM/ }).click()
  await expect(add).toBeEnabled()
  await add.click()
  await page.getByRole('button', { name: 'Saglabāt izmaiņas' }).click()
  await expect(picker).toBeHidden()
  // The saved order is priced by the server: 738.50 + 827.04.
  await expect(page.locator('#main-content')).toContainText('BASE XM', { timeout: 30_000 })
  await expect(page.locator('#main-content')).toContainText(/1[\s ]?565[.,]54/)
})
