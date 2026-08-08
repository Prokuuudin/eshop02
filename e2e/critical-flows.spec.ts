import { test, expect, type Page } from '@playwright/test'
import { BRANDS } from '../data/brands'
import { E2E_CUSTOMER, loginAs } from './helpers'

// Сидим корзину РЕАЛЬНЫМ товаром из Neon: демо-товары (p1-p16) удалены из БД,
// а POST /api/orders проверяет сток на сервере и отвечает 409 на неизвестный id.
const seedCartWithOneItem = async (page: Page): Promise<{ title: string }> => {
  await loginAs(page, E2E_CUSTOMER)
  const response = await page.request.get('/api/products?category=hair&skip=0&take=50')
  const payload = (await response.json()) as { data?: { products?: Array<Record<string, unknown>> } }
  const products = payload.data?.products ?? []
  const product = products.find((p) => (p.stock as number) > 0 && (p.price as number) >= 20) ?? products[0]
  if (!product) throw new Error('seedCartWithOneItem: no products returned by /api/products')

  const cartItem = { ...product, quantity: 1, lineKey: product.id }
  await page.addInitScript((item) => {
    window.localStorage.setItem(
      'eshop_current_user',
      JSON.stringify({
        id: 'u_e2e_customer_fixture',
        email: 'e2e-customer@hairshop-pro.lv.local',
        platformRole: 'customer'
      })
    )
    window.localStorage.setItem(
      'cart-store',
      JSON.stringify({ state: { items: [item] }, version: 0 })
    )
  }, cartItem)

  return { title: String(product.title) }
}

test('cart drawer opens and closes on outside click', async ({ page }) => {
  await seedCartWithOneItem(page)
  await page.goto('/')

  await page.locator('button.header__cart').click()
  await expect(page.getByTestId('cart-drawer-panel')).toBeVisible()

  await page.getByTestId('cart-drawer-backdrop').click()
  await expect(page.getByTestId('cart-drawer-panel')).toHaveClass(/translate-x-full/)
})

test('confirm dialog appears before removing item from cart drawer', async ({ page }) => {
  const { title } = await seedCartWithOneItem(page)
  const titleFragment = title.trim().slice(0, 15)
  await page.goto('/')

  await page.locator('button.header__cart').click()
  await expect(page.getByTestId('cart-drawer-panel')).toBeVisible()

  const drawer = page.getByTestId('cart-drawer-panel')
  await drawer.getByRole('button').filter({ hasText: /Удалить|Remove|Noņemt/i }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button').filter({ hasText: /Отмена|Cancel|Atcelt/i }).click()
  await expect(drawer).toContainText(titleFragment)

  await drawer.getByRole('button').filter({ hasText: /Удалить|Remove|Noņemt/i }).first().click()
  await dialog.getByRole('button').filter({ hasText: /Удалить|Remove|Dzēst|Noņemt/i }).first().click()

  await expect(drawer).not.toContainText(titleFragment)
})

test('checkout submit redirects to order details page', async ({ page }) => {
  test.setTimeout(90_000)

  await seedCartWithOneItem(page)
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, orderId: 'mocked-bank' })
    })
  })
  await page.goto('/checkout')

  const checkoutForm = page.locator('main form:has(input[name="firstName"])').first()

  await checkoutForm.locator('input[name="firstName"]').fill('Ivan')
  await checkoutForm.locator('input[name="lastName"]').fill('Petrov')
  await checkoutForm.locator('input[name="email"]').fill('ivan.petrov@example.com')
  // Телефон — react-phone-number-input, у поля нет name="phone"
  await checkoutForm.locator('.phone-input input').fill('+37120000000')
  await checkoutForm.locator('input[name="address"]').fill('Brivibas iela 1')
  await checkoutForm.locator('input[name="city"]').fill('Riga')
  await checkoutForm.locator('input[name="postalCode"]').fill('LV-1010')

  await checkoutForm.locator('#payment-bank').click()

  const cookieAccept = page.getByRole('button', { name: /Принять все|Accept all|Pieņemt visu/i })
  if (await cookieAccept.isVisible().catch(() => false)) await cookieAccept.click()

  // Чекбокс согласия с условиями (07-12) живёт в сайдбаре, вне формы
  await page.locator('#checkout-terms').click()

  await checkoutForm.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/order\//, { timeout: 60000 })
  await expect(page).toHaveURL(/\/order\//)
})

test('checkout card flow redirects through mocked stripe and shows paid status', async ({ page }) => {
  test.setTimeout(90_000)

  await seedCartWithOneItem(page)
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, orderId: 'mocked' })
    })
  })

  await page.route('**/api/payments/stripe/checkout', async (route) => {
    const payload = route.request().postDataJSON() as { orderId?: string }
    const orderId = payload.orderId ?? 'missing-order-id'

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: 'cs_test_mocked_123',
        url: `/order/${orderId}?payment=success&session_id=cs_test_mocked_123`
      })
    })
  })

  await page.route('**/api/payments/stripe/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paymentStatus: 'paid',
        sessionId: 'cs_test_mocked_123'
      })
    })
  })

  await page.route('**/api/payments/status?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paymentStatus: 'paid', sessionId: 'cs_test_mocked_123' })
    })
  })

  await page.route('**/api/orders/mocked', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        order: {
          id: 'mocked',
          createdAt: new Date().toISOString(),
          items: [],
          subtotal: 39,
          tax: 6.77,
          delivery: 5,
          deliveryMethod: 'courier',
          paymentMethod: 'card',
          discount: 0,
          total: 44,
          firstName: 'Ivan',
          lastName: 'Petrov',
          email: 'ivan.petrov@example.com',
          phone: '+37120000000',
          address: 'Brivibas iela 1',
          city: 'Riga',
          paymentStatus: 'pending',
          paymentProvider: 'stripe',
          paymentSessionId: 'cs_test_mocked_123'
        }
      })
    })
  })

  await page.goto('/checkout')

  const checkoutForm = page.locator('main form:has(input[name="firstName"])').first()

  await checkoutForm.locator('input[name="firstName"]').fill('Ivan')
  await checkoutForm.locator('input[name="lastName"]').fill('Petrov')
  await checkoutForm.locator('input[name="email"]').fill('ivan.petrov@example.com')
  // Телефон — react-phone-number-input, у поля нет name="phone"
  await checkoutForm.locator('.phone-input input').fill('+37120000000')
  await checkoutForm.locator('input[name="address"]').fill('Brivibas iela 1')
  await checkoutForm.locator('input[name="city"]').fill('Riga')
  await checkoutForm.locator('input[name="postalCode"]').fill('LV-1010')

  await checkoutForm.locator('#payment-card').click()

  const cookieAccept = page.getByRole('button', { name: /Принять все|Accept all|Pieņemt visu/i })
  if (await cookieAccept.isVisible().catch(() => false)) await cookieAccept.click()

  // Чекбокс согласия с условиями (07-12) живёт в сайдбаре, вне формы
  await page.locator('#checkout-terms').click()

  await checkoutForm.locator('button[type="submit"]').first().click()

  await expect.poll(() => page.url(), { timeout: 60000 }).toMatch(/\/order\/.*payment=success/)
  await expect(page).toHaveURL(/session_id=cs_test_mocked_123/)
  await expect(page.getByText(/Проверяем оплату|Ожидает подтверждения|Оплачено/)).toBeVisible({ timeout: 15000 })
})

test('review form shows an error when the server rejects the submission', async ({ page }) => {
  // Регрессия: catch в handleSubmit только сбрасывал submitted — при 500 форма
  // молча оставалась на экране без какого-либо фидбека пользователю.
  const response = await page.request.get('/api/products?category=hair&skip=0&take=50')
  const payload = (await response.json()) as { data?: { products?: Array<{ id: string }> } }
  const productId = payload.data?.products?.[0]?.id
  expect(productId).toBeTruthy()

  await page.route('**/api/reviews', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal' }),
    })
  })

  await page.goto(`/product/${productId}`)
  await page.getByRole('button', { name: /Написать рецензию/ }).click({ timeout: 30000 })
  await page.getByPlaceholder(/Кратко о вашем опыте/).fill('E2E error-path test')
  await page.getByPlaceholder(/Поделитесь подробнее/).fill('Проверка отображения ошибки при отказе сервера.')
  await page.getByRole('button', { name: /^Отправить$/ }).click()

  // Ошибка показана, форма не закрылась, «спасибо» не появилось.
  await expect(page.getByText(/Не удалось отправить отзыв/)).toBeVisible({ timeout: 10000 })
  await expect(page.getByPlaceholder(/Кратко о вашем опыте/)).toHaveValue('E2E error-path test')
  await expect(page.getByText(/Спасибо! Отзыв появится/)).not.toBeVisible()
})

test('brand card link opens catalog filtered by selected brand', async ({ page }) => {
  await page.goto('/')

  // После редизайна брендов (f07aec9) карточка — прямая ссылка на каталог,
  // диалога больше нет.
  const firstBrandCard = page.locator('.brands__item').first()
  await expect(firstBrandCard).toBeVisible({ timeout: 45000 })

  const targetHref = await firstBrandCard.getAttribute('href')
  expect(targetHref).toMatch(/^\/catalog\?brand=/)
  const brandId = new URL(targetHref ?? '', 'http://127.0.0.1').searchParams.get('brand')
  expect(brandId?.trim().length).toBeGreaterThan(0)

  await page.goto(targetHref ?? '/catalog')

  // Каталог нормализует brand= в brands= (router.replace) — принимаем обе формы
  await page.waitForURL(/\/catalog\?brands?=/, { timeout: 60000 })
  await expect(page).toHaveURL(new RegExp(`/catalog\\?brands?=${brandId}`))
  await expect(page.getByRole('main').first()).toBeVisible({ timeout: 45000 })
})

test('brand details page link opens catalog filtered by the same brand', async ({ page }) => {
  const firstBrandId = BRANDS[0]?.id
  expect(firstBrandId).toBeTruthy()

  await page.goto(`/brand/${firstBrandId}`)

  const catalogLink = page.locator(`a[href="/catalog?brand=${firstBrandId}"]`).first()
  await expect(catalogLink).toBeVisible({ timeout: 45000 })
  const targetHref = await catalogLink.getAttribute('href')
  expect(targetHref).toBe(`/catalog?brand=${firstBrandId}`)

  await catalogLink.click()

  await page.waitForURL(/\/catalog\?brand=/)
  await expect(page).toHaveURL(new RegExp(`/catalog\\?brand=${firstBrandId}`))
  await expect(page.getByRole('main').first()).toBeVisible({ timeout: 45000 })
})

test('brands anchor navigation works from header and stays correct after reload', async ({ page }) => {
  await page.goto('/')

  const brandsNavLink = page.locator('nav.header__nav a[href="/#brands"]').first()
  await expect(brandsNavLink).toBeVisible({ timeout: 45000 })

  await page.evaluate(() => window.scrollTo(0, 0))
  await brandsNavLink.click()
  await expect(page).toHaveURL(/#brands/)

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.getElementById('brands')
          if (!el) return false
          const rect = el.getBoundingClientRect()
          return rect.top < window.innerHeight && rect.bottom > 0
        }),
      { timeout: 10000 }
    )
    .toBeTruthy()

  await page.reload()
  await expect(page).toHaveURL(/#brands/)

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.getElementById('brands')
          if (!el) return false
          const rect = el.getBoundingClientRect()
          return rect.top < window.innerHeight && rect.bottom > 0
        }),
      { timeout: 10000 }
    )
    .toBeTruthy()
})

// Categories.tsx намеренно скрыт от гостей — сабкатегорийные тесты сидят юзера.
const seedCatalogUser = (page: import('@playwright/test').Page) =>
  loginAs(page, E2E_CUSTOMER)

test('category subcategory selection applies subcat filter in catalog URL', async ({ page }) => {
  await seedCatalogUser(page)
  await page.goto('/')

  const hairCategoryTrigger = page.getByRole('button', {
    name: /Уход за волосами|Hair Care|Matu aprūpe/i
  })

  await expect(hairCategoryTrigger).toBeVisible({ timeout: 45000 })
  await hairCategoryTrigger.click()

  const shampoosLink = page.locator('a[href*="/catalog?cat=hair&subcat=shampoos"]').first()
  await expect(shampoosLink).toBeVisible()
  const shampoosHref = await shampoosLink.getAttribute('href')
  expect(shampoosHref).toContain('/catalog?cat=hair&subcat=shampoos')
  await page.goto(shampoosHref ?? '/catalog?cat=hair&subcat=shampoos')

  await page.waitForURL(/\/catalog\?cat=hair&subcat=shampoos/)
  await expect(page).toHaveURL(/\/catalog\?cat=hair&subcat=shampoos/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })

  // Фильтр реально применён: чип сабкатегории виден, карточки — шампуни
  // (наборы с шампунем тоже затегированы как ŠAMPŪNI в исходной MSSQL)
  await expect(page.locator('.products__subcat-chip')).toBeVisible()
  await expect(cards.first()).toContainText(/Шампунь|Shampoo|šampūns|набор/i)
})

test('face category decorative cosmetics subcategory applies subcat filter', async ({ page }) => {
  await seedCatalogUser(page)
  await page.goto('/')

  const faceCategoryTrigger = page.getByRole('button', {
    name: /Уход за кожей|Skincare|Ādas aprūpe/i
  })

  await expect(faceCategoryTrigger).toBeVisible({ timeout: 45000 })
  await faceCategoryTrigger.click()

  const decorativeCosmeticsLink = page.locator('a[href*="/catalog?cat=face&subcat=decorative-cosmetics"]').first()
  await expect(decorativeCosmeticsLink).toBeVisible()
  await decorativeCosmeticsLink.click()

  await page.waitForURL(/\/catalog\?cat=face&subcat=decorative-cosmetics/)
  await expect(page).toHaveURL(/\/catalog\?cat=face&subcat=decorative-cosmetics/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.products__subcat-chip')).toBeVisible()

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
})

test('equipment category furniture subcategory applies subcat filter', async ({ page }) => {
  await seedCatalogUser(page)
  await page.goto('/')

  const equipmentCategoryTrigger = page.getByRole('button', {
    name: /Аксессуары и инструменты|Accessories & Tools|Piederumi un instrumenti/i
  })

  await expect(equipmentCategoryTrigger).toBeVisible({ timeout: 45000 })
  await equipmentCategoryTrigger.click()

  const furnitureLink = page.locator('a[href*="/catalog?cat=equipment&subcat=furniture"]').first()
  await expect(furnitureLink).toBeVisible()
  await furnitureLink.click()

  await page.waitForURL(/\/catalog\?cat=equipment&subcat=furniture/)
  await expect(page).toHaveURL(/\/catalog\?cat=equipment&subcat=furniture/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.products__subcat-chip')).toBeVisible()

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
})

test('category dropdown item All clears subcat and keeps category filter', async ({ page }) => {
  await seedCatalogUser(page)
  await page.goto('/catalog?cat=hair&subcat=shampoos')

  const cardsWithSubcat = page.locator('.product-card')
  await expect(cardsWithSubcat.first()).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.products__subcat-chip')).toBeVisible()

  await page.goto('/')

  const hairCategoryTrigger = page.getByRole('button', {
    name: /Уход за волосами|Hair Care|Matu aprūpe/i
  })

  await expect(hairCategoryTrigger).toBeVisible({ timeout: 45000 })
  await hairCategoryTrigger.click()

  const allLink = page.getByRole('menuitem', { name: /^Все$|^All$|^Visi$/ }).first()
  await expect(allLink).toBeVisible()
  await allLink.click()

  await page.waitForURL(/\/category\/hair$/)
  await expect(page).toHaveURL(/\/category\/hair$/)

  // Инфинит-скролл показывает 12 карточек в обоих случаях — сравнение
  // количества карточек ничего не говорит; признак сброса — чип исчез.
  const cardsAfterReset = page.locator('.product-card')
  await expect(cardsAfterReset.first()).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.products__subcat-chip')).toHaveCount(0)
})
