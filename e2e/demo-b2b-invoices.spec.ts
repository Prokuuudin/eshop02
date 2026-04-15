import { test, expect, type Page } from '@playwright/test'

const seedCleanState = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

test('demo B2B invoices flow loads dashboard and resets back to fallback', async ({ page }) => {
  await seedCleanState(page)
  await page.goto('/account/invoices')

  await expect(page.getByRole('heading', { name: /Счёта доступны только для B2B клиентов/i })).toBeVisible()

  await page.getByRole('button', { name: /Загрузить demo B2B-данные/i }).click()

  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('eshop_current_user')))
    .toContain('u_demo_b2b_manager')

  await page.reload()

  await expect(page.getByText('Beauty Supply Pro', { exact: true })).toBeVisible()
  await expect(page.getByText(/INV-2026-001000/i)).toBeVisible()
  await expect(page.getByText(/INV-2026-001001/i)).toBeVisible()
  await expect(page.getByText(/INV-2026-001002/i)).toBeVisible()

  const afterSeed = await page.evaluate(() => ({
    currentUser: window.localStorage.getItem('eshop_current_user'),
    users: window.localStorage.getItem('eshop_users')
  }))

  expect(afterSeed.currentUser).toContain('u_demo_b2b_manager')
  expect(afterSeed.currentUser).toContain('company_beauty_supply')
  expect(afterSeed.users).toContain('b2b-demo@eshop02.local')

  await page.getByRole('button', { name: /Выйти из demo B2B/i }).click()

  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('eshop_current_user')))
    .toBeNull()

  await page.reload()

  await expect(page.getByRole('heading', { name: /Счёта доступны только для B2B клиентов/i })).toBeVisible()

  const afterReset = await page.evaluate(() => ({
    currentUser: window.localStorage.getItem('eshop_current_user'),
    users: window.localStorage.getItem('eshop_users')
  }))

  expect(afterReset.currentUser).toBeNull()
  expect(afterReset.users).not.toContain('b2b-demo@eshop02.local')
})