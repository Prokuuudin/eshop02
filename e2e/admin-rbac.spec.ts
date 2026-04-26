import { test, expect, type Page } from '@playwright/test'

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
  await seedSession(
    page,
    [
      {
        id: 'u_manager_e2e',
        email: 'manager-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'E2E Manager',
        platformRole: 'customer',
        teamRole: 'manager',
        companyId: 'company_miks_plus',
        companyName: 'SIA MIKS PLUS',
        approvalRequired: false,
        auditLoggingEnabled: true
      }
    ],
    'u_manager_e2e'
  )

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
  await expect(page.getByText('Частичный доступ менеджера')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть RFQ панель' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть баркоды' })).toHaveCount(0)

  await page.goto('/admin/rfq')
  await expect(page.getByRole('heading', { name: 'RFQ заявки' })).toBeVisible()
})

test('manager is forbidden from full-access admin pages', async ({ page }) => {
  await seedSession(
    page,
    [
      {
        id: 'u_manager_blocked_e2e',
        email: 'manager-blocked-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'Blocked Manager',
        platformRole: 'customer',
        teamRole: 'manager',
        companyId: 'company_miks_plus',
        companyName: 'SIA MIKS PLUS',
        approvalRequired: false,
        auditLoggingEnabled: true
      }
    ],
    'u_manager_blocked_e2e'
  )

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Доступ запрещён' })).toBeVisible()
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

  await page.addInitScript(() => {
    const cartState = {
      state: {
        items: [
          {
            id: 'p1',
            title: 'Крем для лица Revitaluxe 50ml',
            brand: 'sanctuaryspa',
            price: 2500,
            rating: 4.7,
            image: '/products/p1.jpg',
            category: 'face',
            stock: 3,
            quantity: 1
          }
        ]
      },
      version: 0
    }

    window.localStorage.setItem('cart-store', JSON.stringify(cartState))
  })

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

test('admin can change existing account team role', async ({ page }) => {
  await seedSession(
    page,
    [
      {
        id: 'u_admin_rbac_e2e',
        email: 'admin-rbac-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'RBAC Admin',
        platformRole: 'admin',
        auditLoggingEnabled: true
      },
      {
        id: 'u_buyer_target_e2e',
        email: 'buyer-target-e2e@eshop02.local',
        password: 'StrongPass123',
        name: 'Buyer Target',
        platformRole: 'customer',
        teamRole: 'buyer',
        companyId: 'company_miks_plus',
        companyName: 'SIA MIKS PLUS',
        approvalRequired: true,
        auditLoggingEnabled: true
      }
    ],
    'u_admin_rbac_e2e'
  )

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Управление аккаунтами' })).toBeVisible()
  await expect(page.getByText('buyer-target-e2e@eshop02.local')).toBeVisible()

  const companyAccountsSection = page.locator('div').filter({ hasText: 'Аккаунты компании и роли' }).first()
  await companyAccountsSection.locator('select').first().selectOption('manager')
  await companyAccountsSection.getByRole('button', { name: 'Сменить роль' }).first().click()

  await expect(page.getByText('Роль пользователя обновлена')).toBeVisible()

  const usersState = await page.evaluate(() => {
    const rawUsers = window.localStorage.getItem('eshop_users')
    return rawUsers ? (JSON.parse(rawUsers) as Array<{ id: string; teamRole?: string; approvalRequired?: boolean }>) : []
  })

  const updatedUser = usersState.find((user) => user.id === 'u_buyer_target_e2e')
  expect(updatedUser?.teamRole).toBe('manager')
  expect(updatedUser?.approvalRequired).toBe(false)
})
