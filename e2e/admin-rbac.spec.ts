import { test, expect, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_MANAGER, fetchRealProduct, loginAs, setUiLanguage } from './helpers'

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

// First visits compile pages in development mode.
test.describe.configure({ timeout: 120_000 })

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
  await setUiLanguage(page, 'ru')

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
  await expect(page.getByText('Частичный доступ менеджера')).toBeVisible()
  // Плитки дэшборда — ссылки со стрелкой, не кнопки
  await expect(page.getByRole('link', { name: /Открыть RFQ панель/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Открыть баркоды/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Открыть баркоды/ })).toHaveCount(0)

  await page.goto('/admin/rfq')
  await expect(page.getByRole('heading', { name: 'RFQ-заявки' })).toBeVisible()

  // Проверяем серверную матрицу, а не только доступность клиентского экрана.
  const ordersResponse = await page.request.get('/api/admin/orders?take=1')
  expect(ordersResponse.ok()).toBeTruthy()
  const ordersPayload = (await ordersResponse.json()) as { orders?: unknown[] }
  expect(Array.isArray(ordersPayload.orders)).toBe(true)

  const rfqResponse = await page.request.get('/api/rfq?take=1')
  expect(rfqResponse.ok()).toBeTruthy()
  const rfqPayload = (await rfqResponse.json()) as { requests?: unknown[] }
  expect(Array.isArray(rfqPayload.requests)).toBe(true)

  // Reading customers is a manager permission (customers.read); staff and promotion
  // administration (users.manage) is not.
  expect((await page.request.get('/api/admin/users?take=1')).status()).toBe(200)
  expect((await page.request.get('/api/admin/promo-codes')).status()).toBe(403)
})

test('manager is denied full-access admin pages with a not-found page and 403 APIs', async ({ page }) => {
  await loginAs(page, E2E_MANAGER)
  await seedSession(page, [E2E_MANAGER], E2E_MANAGER.id)
  await setUiLanguage(page, 'ru')

  // AdminServerPermission answers a missing permission with notFound(): the page
  // neither renders nor reveals that it exists (the legacy redirect never runs).
  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('.not-found__title')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Клиентские баркоды' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/admin\/client-barcodes/)
  expect((await page.request.get('/api/admin/promo-codes')).status()).toBe(403)
})

test('manager cannot place orders from cart or checkout', async ({ page }) => {
  await loginAs(page, E2E_MANAGER)
  await seedSession(page, [E2E_MANAGER], E2E_MANAGER.id)
  await setUiLanguage(page, 'ru')

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
  await loginAs(page, E2E_MANAGER)
  await seedSession(page, [E2E_MANAGER], E2E_MANAGER.id)
  await setUiLanguage(page, 'ru')

  await page.goto('/')

  const userMenu = page.getByRole('button', { name: /Меню пользователя|Личный кабинет|Account|Konts/i })
  await expect(userMenu).toBeVisible()
  // The header already has an icon admin link with the same name; opening the user
  // menu must add the menu entry.
  const adminLinks = page.getByRole('link', { name: /Админ-панель|Admin Panel|Administrācijas panelis/i })
  await expect(adminLinks).toHaveCount(1)
  await userMenu.evaluate((element: HTMLButtonElement) => element.click())
  await expect(adminLinks).toHaveCount(2)
  await expect(adminLinks.last()).toBeVisible()
})

test('legacy admin accounts route redirects to client cards', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, E2E_ADMIN)
  await seedSession(page, [E2E_ADMIN], E2E_ADMIN.id)
  await setUiLanguage(page, 'ru')

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  // The legacy route renders the client cards section (app/[lang]/admin/client-barcodes).
  await expect(page.getByRole('heading', { level: 1, name: 'Зарегистрированные клиенты' })).toBeVisible({ timeout: 60_000 })
})
