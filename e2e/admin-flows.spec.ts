import { test, expect, type Page } from '@playwright/test'
import { E2E_ADMIN, loginAs } from './helpers'

const seedCleanState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

const seedAdminSession = async (page: Page): Promise<void> => {
  await page.addInitScript((adminUser) => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('eshop_users', JSON.stringify([adminUser]))
    window.localStorage.setItem('eshop_current_user', JSON.stringify(adminUser))
  }, E2E_ADMIN)
}

test('admin setup form cannot bypass the DB-backed admin gate', async ({ page }) => {
  // Первичная настройка — клиентский флоу (localStorage). В shared-БД админы
  // уже есть, и серверный гейт /admin (getServerUser) такого «админа» не
  // пускает: после сабмита должен выбросить на логин, не в админку.
  await seedCleanState(page)
  await page.goto('/auth/admin-setup')

  await expect(page.getByRole('heading', { name: 'Первичная настройка администратора' })).toBeVisible()

  await page.getByLabel(/^Имя$/).fill('Manual Admin')
  await page.getByLabel(/^Email$/).fill('manual-admin@eshop02.local')
  await page.getByLabel(/^Пароль$/).fill('StrongPass123')
  await page.getByLabel(/^Повторите пароль$/).fill('StrongPass123')

  await page.getByRole('button', { name: 'Создать администратора' }).click()

  await page.waitForURL(/\/auth\/login/)
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('admin can open client barcodes page', async ({ page }) => {
  // Настоящая DB-сессия для серверного гейта + localStorage для клиентских сторов
  await loginAs(page, E2E_ADMIN)
  await seedAdminSession(page)
  await page.goto('/admin/client-barcodes')

  // Заголовок редактируется через CMS-реестр — принимаем дефолт и текущий override
  await expect(page.getByRole('heading', { name: /Клиентские баркоды|Карты клиентов/ })).toBeVisible()
  await expect(page.getByText(/Заявки мастеров/)).toBeVisible()
  await expect(page.getByPlaceholder(/Поиск по карте/)).toBeVisible()
})
