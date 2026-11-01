import { test, expect, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_CUSTOMER, E2E_MANAGER, loginAs, setUiLanguage, type E2eUserFixture } from './helpers'

// Product lines, promo codes and campaigns are platform-admin only: catalog.read /
// catalog.update for lines, users.manage for promotions. Staff managers, customers and
// anonymous visitors must be refused by the server, whatever the UI shows.

// First visits compile pages in development mode.
test.describe.configure({ timeout: 240_000 })

const TITLES = { ru: 'Товарные линейки', lv: 'Produktu līnijas', en: 'Product lines' } as const
// Same-origin header, so a refusal below comes from RBAC and not from the CSRF guard.
const ORIGIN = { origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3005' }
const pagePath = (language: keyof typeof TITLES, path: string): string => (language === 'ru' ? path : `/${language}${path}`)

const seedCurrentUser = async (page: Page, fixture: E2eUserFixture): Promise<void> => {
  await page.addInitScript((user) => {
    window.localStorage.setItem('eshop_current_user', JSON.stringify(user))
  }, { id: fixture.id, email: fixture.email, name: fixture.name, platformRole: fixture.platformRole, teamRole: fixture.teamRole })
}

const firstLine = async (page: Page): Promise<{ id: string }> => {
  const response = await page.request.get('/api/admin/brand-lines')
  expect(response.status()).toBe(200)
  const body = (await response.json()) as { lines: Array<{ id: string; key: string }> }
  expect(body.lines.length).toBeGreaterThan(0)
  return body.lines[0]
}

test('admin reads and changes product lines in RU, LV and EN and manages promotions', async ({ page }) => {
  await loginAs(page, E2E_ADMIN)
  await seedCurrentUser(page, E2E_ADMIN)

  for (const language of ['ru', 'lv', 'en'] as const) {
    await setUiLanguage(page, language)
    await page.goto(pagePath(language, '/admin/brand-lines'), { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: TITLES[language] })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 60_000 })
  }

  // A throwaway line keeps the synchronized lines untouched; it is archived at the end.
  const line = await firstLine(page)
  const detail = (await (await page.request.get(`/api/admin/brand-lines/${line.id}`)).json()) as { line: { brandKey: string } }
  const slug = `e2e-rbac-${Date.now()}`
  const created = await page.request.post('/api/admin/brand-lines', { headers: ORIGIN, data: { brandKey: detail.line.brandKey, slug, names: { lv: 'E2E RBAC', ru: 'E2E RBAC', en: 'E2E RBAC' } } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: string }
  const renamed = await page.request.patch(`/api/admin/brand-lines/${id}`, { headers: ORIGIN, data: { names: { lv: 'E2E RBAC LV', ru: 'E2E RBAC RU', en: 'E2E RBAC EN' } } })
  expect(renamed.status()).toBe(200)
  expect((await page.request.patch(`/api/admin/brand-lines/${id}`, { headers: ORIGIN, data: { status: 'archived' } })).status()).toBe(200)

  expect((await page.request.get('/api/admin/promo-codes')).status()).toBe(200)
  expect((await page.request.get('/api/admin/campaigns')).status()).toBe(200)
  const options = (await (await page.request.get('/api/admin/promo-options')).json()) as { brandLines?: unknown[] }
  expect(Array.isArray(options.brandLines) && options.brandLines.length > 0).toBe(true)
})

test('staff manager can neither read nor change product lines or promotions', async ({ page }) => {
  await loginAs(page, E2E_MANAGER)
  await seedCurrentUser(page, E2E_MANAGER)
  await setUiLanguage(page, 'lv')

  // The admin layout checks the path permission (catalog.read) and refuses in the visitor's language.
  await page.goto('/lv/admin/brand-lines', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: 'Piekļuve liegta' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { level: 1, name: TITLES.lv })).toHaveCount(0)

  expect((await page.request.get('/api/admin/brand-lines')).status()).toBe(403)
  expect((await page.request.post('/api/admin/brand-lines', { headers: ORIGIN, data: { brandKey: 'x', slug: 'e2e-denied', names: { lv: 'X' } } })).status()).toBe(403)
  expect((await page.request.patch('/api/admin/brand-lines/any-line', { headers: ORIGIN, data: { slug: 'x' } })).status()).toBe(403)
  expect((await page.request.post('/api/admin/brand-lines/any-line/products', { headers: ORIGIN, data: { product: '1', action: 'exclude' } })).status()).toBe(403)
  expect((await page.request.post('/api/admin/brand-lines/review/any-item', { headers: ORIGIN, data: { action: 'dismiss' } })).status()).toBe(403)
  expect((await page.request.get('/api/admin/promo-codes')).status()).toBe(403)
  expect((await page.request.post('/api/admin/promo-codes', { headers: ORIGIN, data: { code: 'E2EDENIED', appliesTo: 'brand_lines', brandLineIds: ['x'] } })).status()).toBe(403)
  expect((await page.request.get('/api/admin/campaigns')).status()).toBe(403)
  expect((await page.request.post('/api/admin/campaigns', { headers: ORIGIN, data: { name: 'denied', type: 'discount', startDate: '2026-10-30', targetBrandLineIds: ['x'] } })).status()).toBe(403)
})

test('customers and anonymous visitors are refused product lines and promotions', async ({ page, request }) => {
  for (const path of ['/api/admin/brand-lines', '/api/admin/promo-codes', '/api/admin/campaigns', '/api/admin/promo-options']) {
    expect((await request.get(path)).status()).toBe(401)
  }

  await loginAs(page, E2E_CUSTOMER)
  await seedCurrentUser(page, E2E_CUSTOMER)
  await setUiLanguage(page, 'en')
  // Non-staff visitors are sent to the admin sign-in instead of any admin content.
  await page.goto('/en/admin/brand-lines', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/en\/auth\/login/u, { timeout: 60_000 })
  await expect(page.getByRole('heading', { level: 1, name: TITLES.en })).toHaveCount(0)

  for (const path of ['/api/admin/brand-lines', '/api/admin/promo-codes', '/api/admin/campaigns', '/api/admin/promo-options']) {
    expect((await page.request.get(path)).status()).toBe(403)
  }
  expect((await page.request.patch('/api/admin/brand-lines/any-line', { headers: ORIGIN, data: { slug: 'x' } })).status()).toBe(403)
})
