import { test, expect, type Page } from '@playwright/test'

const seedCleanState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

const seedAdminSession = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()

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
}

test('first admin setup creates administrator and opens admin panel', async ({ page }) => {
  await seedCleanState(page)
  await page.goto('/auth/admin-setup')

  await expect(page.getByRole('heading', { name: 'Первичная настройка администратора' })).toBeVisible()

  await page.getByLabel(/^Имя$/).fill('Manual Admin')
  await page.getByLabel(/^Email$/).fill('manual-admin@eshop02.local')
  await page.getByLabel(/^Пароль$/).fill('StrongPass123')
  await page.getByLabel(/^Повторите пароль$/).fill('StrongPass123')

  await page.getByRole('button', { name: 'Создать администратора' }).click()

  await page.waitForURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть баркоды' })).toBeVisible()
})

test('admin can download company barcode card as pdf', async ({ page }) => {
  await seedAdminSession(page)
  await page.goto('/admin/client-barcodes')

  await expect(page.getByRole('heading', { name: 'Клиентские баркоды' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Печатная карточка клиента' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать PDF' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^CLI-\d{5}\.pdf$/)
  await expect(page.getByText('PDF карточки подготовлен')).toBeVisible()
})