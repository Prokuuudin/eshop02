import { test, expect, type Page } from '@playwright/test'

const seedCleanState = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

test('customer activation by barcode creates linked account and redirects home', async ({ page }) => {
  await seedCleanState(page)
  await page.goto('/auth/register')

  await expect(page.getByRole('heading', { name: /Заявка на доступ|access request|piekļuves pieprasījums/i })).toBeVisible()

  await page.locator('form input[type="text"]').first().fill('Client User')
  await page.locator('form input[type="email"]').fill('client-user@eshop02.local')
  await page.locator('form input[type="password"]').fill('StrongPass123')
  await page.locator('form input[placeholder="CLI-10001"]').fill('CLI-10001')

  const registerForm = page.locator('form:has(input[placeholder="CLI-10001"])').first()
  const submitAccessRequestButton = registerForm.locator('button[type="submit"]').first()
  await submitAccessRequestButton.scrollIntoViewIfNeeded()
  await submitAccessRequestButton.click()

  await expect
    .poll(async () => {
      return page.evaluate(() => window.localStorage.getItem('access-request-store'))
    }, { timeout: 10000 })
    .toContain('client-user@eshop02.local')

  const pendingState = await page.evaluate(() => ({
    currentUser: window.localStorage.getItem('eshop_current_user'),
    users: window.localStorage.getItem('eshop_users'),
    accessRequests: window.localStorage.getItem('access-request-store')
  }))

  expect(pendingState.currentUser).toBeNull()
  expect(pendingState.users).toBeNull()
  expect(pendingState.accessRequests).toContain('client-user@eshop02.local')

  await page.evaluate(() => {
    const adminUser = {
      id: 'u_admin_e2e',
      email: 'admin-e2e@eshop02.local',
      password: 'StrongPass123',
      name: 'E2E Admin',
      platformRole: 'admin',
      auditLoggingEnabled: true
    }

    window.localStorage.setItem('eshop_users', JSON.stringify([adminUser]))
    window.localStorage.setItem('eshop_current_user', JSON.stringify(adminUser))
  })

  await page.goto('/admin/client-barcodes')
  await expect(page.getByRole('heading', { name: /Заявки на доступ/i })).toBeVisible()
  await expect(page.getByText('client-user@eshop02.local')).toBeVisible()
  await page.getByRole('button', { name: /Одобрить/i }).first().click()
  await expect(page.getByText(/Заявка одобрена/i)).toBeVisible()

  await page.evaluate(() => {
    window.localStorage.removeItem('eshop_current_user')
  })

  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill('client-user@eshop02.local')
  await page.locator('input[type="password"]').fill('StrongPass123')
  await page.locator('input[type="password"]').press('Enter')
  await page.waitForURL(/\/$/)
  await expect(page).toHaveURL('/')

  const authState = await page.evaluate(() => ({
    currentUser: window.localStorage.getItem('eshop_current_user'),
    users: window.localStorage.getItem('eshop_users'),
    companyStore: window.localStorage.getItem('company-store'),
    accessRequests: window.localStorage.getItem('access-request-store')
  }))

  const currentUser = JSON.parse(authState.currentUser ?? '{}') as { email?: string; companyId?: string; companyName?: string; teamRole?: string }
  expect(currentUser.email).toBe('client-user@eshop02.local')
  expect(currentUser.companyId).toBe('company_miks_plus')
  expect(currentUser.companyName).toBe('SIA MIKS PLUS')
  expect(currentUser.teamRole).toBe('admin')

  expect(authState.users).toContain('client-user@eshop02.local')
  expect(authState.companyStore).toContain('company_miks_plus')
  expect(authState.accessRequests).toContain('approved')
})