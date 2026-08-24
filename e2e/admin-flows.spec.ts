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
  await page.getByLabel(/^Email$/).fill('manual-admin@hairshop-pro.lv.local')
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

for (const locale of ['en', 'lv'] as const) {
  test(`shared admin controls are localized in ${locale}`, async ({ page }) => {
    await loginAs(page, E2E_ADMIN)
    await seedAdminSession(page)
    await page.goto(`/${locale}/admin`)

    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    const searchLabel = locale === 'en' ? 'Search' : 'Meklēt'
    const placeholder = locale === 'en'
      ? 'Order, product, customer, promo code...'
      : 'Pasūtījums, produkts, klients, promokods...'
    await page.getByRole('button', { name: new RegExp(searchLabel, 'i') }).click()
    await expect(page.getByPlaceholder(placeholder)).toBeVisible()
  })
}

test('admin products page fetches the list once and does not get stuck on empty state', async ({ page }) => {
  // Регрессия, два наложенных бага:
  // 1) useProductsAdmin.loadProducts был в useCallback([t]), а t() из useTranslation
  //    не мемоизировался — новая identity на каждый ре-рендер.
  // 2) lib/site-content-store.ts loadSiteContentOverrides() не дедуплицировал
  //    параллельные вызовы — каждый смонтированный useTranslation()/useSiteContent()
  //    на странице (их десятки) гонял свой fetch('/api/content') и звал
  //    notifySiteContentChanged() по резолву, каскадно меняя overrides у всех.
  // Вместе это заваливало /api/admin/products повторными запросами (18-20+ за
  // секунды), пока список товаров надолго показывал "Нет результатов поиска".
  await loginAs(page, E2E_ADMIN)
  await seedAdminSession(page)

  const productListRequests: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/admin/products') {
      productListRequests.push(req.url())
    }
  })

  await page.goto('/admin/products')

  // Первый визит на роут в dev-режиме компилируется on-demand — таймаут щедрый
  // не из-за бага, а из-за компиляции; регрессия проверяется числом запросов ниже.
  await expect(page.getByText('Редактировать').first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Нет результатов поиска')).not.toBeVisible()

  // Потолок 4 = React StrictMode дважды монтирует эффекты в dev (×2), помноженное
  // на один законный переход overrides "дефолт → загружено с сервера" (×2).
  // Цикл рефетча даёт на порядок больше запросов.
  expect(productListRequests.length).toBeLessThanOrEqual(4)
})

test('admin banners form shows a live storefront preview', async ({ page }) => {
  await loginAs(page, E2E_ADMIN)
  await seedAdminSession(page)
  await page.goto('/admin/content/banners')

  await page.getByRole('button', { name: 'Добавить баннер' }).click()

  const preview = page.getByRole('region', { name: 'Предпросмотр на витрине' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Заголовок баннера')).toBeVisible()

  await page.getByPlaceholder('Заголовок баннера').first().fill('Тестовый баннер')
  await expect(preview.getByText('Тестовый баннер')).toBeVisible()
})

test('price groups show amounts in euros, not rubles', async ({ page }) => {
  // Регрессия 1: цены в таблице групп рендерились через .toLocaleString('ru-RU') + '₽' —
  // похоже на скопированный шаблон, магазин латвийский, весь остальной админ — €.
  // Регрессия 2 (вскрылась при написании этого теста): страница ждала от
  // /api/admin/products голый массив, а он отдаёт {success, data: {products}} —
  // список товаров для индивидуальных цен был всегда пуст.
  // Используем существующую сидовую группу "Розница", а не создаём свою — создание
  // через общий KV в Neon давало гонки между параллельными прогонами теста.
  await loginAs(page, E2E_ADMIN)
  await seedAdminSession(page)

  await page.goto('/admin/marketing/price-groups')

  const groupCard = page.getByText('Розница', { exact: true })
  await expect(groupCard).toBeVisible({ timeout: 20000 })
  await groupCard.click()

  const priceTable = page.locator('table').filter({ hasText: 'Базовая' })
  await expect(priceTable.locator('tbody tr').first()).toBeVisible({ timeout: 10000 })

  await expect(priceTable.getByText('₽')).toHaveCount(0)
  await expect(priceTable.locator('tbody tr').first()).toContainText('€')
})
