import { test, expect, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_MANAGER, fetchRealProduct, loginAs } from './helpers'

test.setTimeout(120_000)

type SeedUser = {
  id: string
  email: string
  password: string
  name: string
  platformRole: 'customer' | 'admin'
  teamRole?: 'viewer' | 'buyer' | 'manager' | 'admin'
  companyId?: string
  companyName?: string
  approvalRequired?: boolean
  auditLoggingEnabled?: boolean
}

const seedSession = async (page: Page, users: SeedUser[], currentUserId: string): Promise<void> => {
  await page.addInitScript(
    ({ seededUsers, seededCurrentUserId }) => {
      window.localStorage.clear()
      window.sessionStorage.clear()

      const currentUser = seededUsers.find((user) => user.id === seededCurrentUserId) ?? null

      window.localStorage.setItem('eshop_users', JSON.stringify(seededUsers))
      if (currentUser) {
        window.localStorage.setItem('eshop_current_user', JSON.stringify(currentUser))
      }
    },
    {
      seededUsers: users,
      seededCurrentUserId: currentUserId
    }
  )
}

test('manager can access partial admin dashboard and RFQ only', async ({ page }) => {
  // Серверный гейт /admin (layout, DB-сессия) + localStorage для клиентских сторов
  await loginAs(page, E2E_MANAGER)
  await seedSession(page, [E2E_MANAGER], E2E_MANAGER.id)

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
  await expect(page.getByText('Частичный доступ менеджера')).toBeVisible()
  // Плитки дэшборда — ссылки со стрелкой, не кнопки
  await expect(page.getByRole('link', { name: /Открыть RFQ панель/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Открыть баркоды/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Открыть баркоды/ })).toHaveCount(0)

  await page.goto('/admin/rfq')
  await expect(page.getByRole('heading', { name: 'RFQ заявки' })).toBeVisible()
})

test('manager is forbidden from full-access admin pages', async ({ page }) => {
  await loginAs(page, E2E_MANAGER)
  await seedSession(page, [E2E_MANAGER], E2E_MANAGER.id)

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: /Доступ запрещ[её]н/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Перейти в аккаунт' })).toBeVisible()
})

test('manager cannot place orders from cart or checkout', async ({ page }) => {
  await seedSession(
    page,
    [
      {
        id: 'u_manager_checkout_e2e',
        email: 'manager-checkout-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'Manager Checkout',
        platformRole: 'customer',
        teamRole: 'manager',
        companyId: 'company_miks_plus',
        companyName: 'SIA MIKS PLUS',
        approvalRequired: false,
        auditLoggingEnabled: true
      }
    ],
    'u_manager_checkout_e2e'
  )

  // Живой товар вместо удалённого из БД p1
  const product = await fetchRealProduct(page)
  await page.addInitScript((item) => {
    window.localStorage.setItem(
      'cart-store',
      JSON.stringify({ state: { items: [item] }, version: 0 })
    )
  }, { ...product, quantity: 1, lineKey: product.id })

  await page.goto('/cart')

  await expect(page.getByText('Для роли менеджера оформление заказа недоступно').first()).toBeVisible()
  await expect(page.locator('a[href^="/checkout"]')).toHaveCount(0)

  await page.goto('/checkout')

  await expect(page.getByRole('heading', { name: 'Оформление недоступно для текущей роли' })).toBeVisible()
})

test('manager sees admin navigation link in user menu', async ({ page }) => {
  await seedSession(
    page,
    [
      {
        id: 'u_manager_menu_e2e',
        email: 'manager-menu-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'Manager Menu',
        platformRole: 'customer',
        teamRole: 'manager',
        companyId: 'company_miks_plus',
        companyName: 'SIA MIKS PLUS',
        approvalRequired: false,
        auditLoggingEnabled: true
      }
    ],
    'u_manager_menu_e2e'
  )

  await page.goto('/')

  await page.getByRole('button', { name: /Меню пользователя|Личный кабинет|Account|Konts/i }).click()
  await expect(page.getByRole('link', { name: /Админ-панель|Admin Panel|Administrācijas panelis/i })).toBeVisible()
})

test('admin can change user platform role in DB accounts table', async ({ page }) => {
  // Страница аккаунтов теперь DB-backed: таблица юзеров из Neon + смена
  // platformRole через API. Старая localStorage-секция «Аккаунты компании
  // и роли» осталась, но требует компании в DB-сторе — company_miks_plus
  // там нет, так что тестируем поддерживаемый DB-флоу.
  await loginAs(page, E2E_ADMIN)
  await seedSession(page, [E2E_ADMIN], E2E_ADMIN.id)

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Управление аккаунтами' })).toBeVisible()

  // Ищем фикстурного менеджера в DB-таблице
  await page.getByPlaceholder(/Email, имя, карта/).fill(E2E_MANAGER.email)
  const row = page.locator('tr', { hasText: E2E_MANAGER.email })
  await expect(row).toBeVisible({ timeout: 15000 })

  // customer -> b2b (globalSetup сбрасывает роль фикстуры перед каждым прогоном)
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: 'b2b' }).click()

  await expect(page.getByText(/Роль обновлена|Роль пользователя обновлена/)).toBeVisible()

  // Возвращаем customer, чтобы не оставлять фикстуру в изменённом состоянии
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: 'customer' }).click()
  await expect(row.getByRole('combobox')).toContainText('customer')
})
