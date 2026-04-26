import { test, expect, type Page } from '@playwright/test'
import { BRANDS } from '../data/brands'

const seedCartWithOneItem = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const cartState = {
      state: {
        items: [
          {
            id: 'p1',
            title: 'Крем для лица Revitaluxe 50ml',
            brand: 'Revitaluxe',
            price: 2500,
            oldPrice: 3200,
            rating: 4.7,
            image: '/products/p1.jpg',
            badges: ['sale', 'bestseller'],
            category: 'face',
            stock: 15,
            purpose: 'Для увлажнения',
            quantity: 1
          }
        ]
      },
      version: 0
    }

    window.localStorage.setItem('cart-store', JSON.stringify(cartState))
  })
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
  await seedCartWithOneItem(page)
  await page.goto('/')

  await page.locator('button.header__cart').click()
  await expect(page.getByTestId('cart-drawer-panel')).toBeVisible()

  const drawer = page.getByTestId('cart-drawer-panel')
  await drawer.getByRole('button').filter({ hasText: /Удалить|Remove|Noņemt/i }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button').filter({ hasText: /Отмена|Cancel|Atcelt/i }).click()
  await expect(drawer).toContainText('Revitaluxe')

  await drawer.getByRole('button').filter({ hasText: /Удалить|Remove|Noņemt/i }).first().click()
  await dialog.getByRole('button').filter({ hasText: /Удалить|Remove|Dzēst|Noņemt/i }).first().click()

  await expect(drawer).not.toContainText('Revitaluxe')
})

test('checkout submit redirects to order details page', async ({ page }) => {
  test.setTimeout(90_000)

  await seedCartWithOneItem(page)
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'eshop_current_user',
      JSON.stringify({
        id: 'u_retail_e2e',
        email: 'retail-e2e@eshop02.local',
        password: 'secret',
        platformRole: 'customer'
      })
    )
  })
  await page.goto('/checkout')

  const checkoutForm = page.locator('main form:has(input[name="firstName"])').first()

  await checkoutForm.locator('input[name="firstName"]').fill('Ivan')
  await checkoutForm.locator('input[name="lastName"]').fill('Petrov')
  await checkoutForm.locator('input[name="email"]').fill('ivan.petrov@example.com')
  await checkoutForm.locator('input[name="phone"]').fill('+37120000000')
  await checkoutForm.locator('input[name="address"]').fill('Brivibas iela 1')
  await checkoutForm.locator('input[name="city"]').fill('Riga')
  await checkoutForm.locator('input[name="postalCode"]').fill('LV-1010')

  await checkoutForm.locator('#payment-bank').click()

  await checkoutForm.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/order\//, { timeout: 60000 })
  await expect(page).toHaveURL(/\/order\//)
})

test('checkout card flow redirects through mocked stripe and shows paid status', async ({ page }) => {
  test.setTimeout(90_000)

  await seedCartWithOneItem(page)
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'eshop_current_user',
      JSON.stringify({
        id: 'u_retail_card_e2e',
        email: 'retail-card-e2e@eshop02.local',
        password: 'secret',
        platformRole: 'customer'
      })
    )
  })

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

  await page.goto('/checkout')

  const checkoutForm = page.locator('main form:has(input[name="firstName"])').first()

  await checkoutForm.locator('input[name="firstName"]').fill('Ivan')
  await checkoutForm.locator('input[name="lastName"]').fill('Petrov')
  await checkoutForm.locator('input[name="email"]').fill('ivan.petrov@example.com')
  await checkoutForm.locator('input[name="phone"]').fill('+37120000000')
  await checkoutForm.locator('input[name="address"]').fill('Brivibas iela 1')
  await checkoutForm.locator('input[name="city"]').fill('Riga')
  await checkoutForm.locator('input[name="postalCode"]').fill('LV-1010')

  await checkoutForm.locator('#payment-card').click()

  await checkoutForm.locator('button[type="submit"]').first().click()

  await page.waitForURL(/\/order\/.*payment=success/, { timeout: 60000 })
  await expect(page).toHaveURL(/session_id=cs_test_mocked_123/)
  await expect(page.getByText(/Проверяем оплату|Ожидает подтверждения|Оплачено/)).toBeVisible({ timeout: 15000 })
})

test('brand card link opens catalog filtered by selected brand', async ({ page }) => {
  await page.goto('/')

  const firstBrandCard = page.locator('.brands__item').first()
  await expect(firstBrandCard).toBeVisible({ timeout: 45000 })

  await firstBrandCard.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const catalogLink = dialog.locator('a[href^="/catalog?brand="]').first()
  await expect(catalogLink).toBeVisible()
  const targetHref = await catalogLink.getAttribute('href')
  expect(targetHref).toBeTruthy()
  const brandId = new URL(targetHref ?? '', 'http://127.0.0.1').searchParams.get('brand')
  expect(brandId?.trim().length).toBeGreaterThan(0)

  await page.goto(targetHref ?? '/catalog')

  await page.waitForURL(/\/catalog\?brand=/, { timeout: 60000 })
  await expect(page).toHaveURL(new RegExp(`/catalog\\?brand=${brandId}`))
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

test('category subcategory selection applies subcat filter in catalog URL', async ({ page }) => {
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
  await expect(cards).toHaveCount(1)

  await expect(cards.first()).toContainText(/Шампунь|Shampoo|šampūns/i)
})

test('face category decorative cosmetics subcategory applies subcat filter', async ({ page }) => {
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

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
  expect(cardCount).toBeLessThanOrEqual(2)
})

test('misc category salon products subcategory applies subcat filter', async ({ page }) => {
  await page.goto('/')

  const miscCategoryTrigger = page.getByRole('button', {
    name: /Разное|Miscellaneous|Dažādi/i
  })

  await expect(miscCategoryTrigger).toBeVisible({ timeout: 45000 })
  await miscCategoryTrigger.click()

  const salonProductsLink = page.locator('a[href*="/catalog?cat=new&subcat=salon-products"]').first()
  await expect(salonProductsLink).toBeVisible()
  await salonProductsLink.click()

  await page.waitForURL(/\/catalog\?cat=new&subcat=salon-products/)
  await expect(page).toHaveURL(/\/catalog\?cat=new&subcat=salon-products/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
})

test('category dropdown item All clears subcat and keeps category filter', async ({ page }) => {
  await page.goto('/catalog?cat=hair&subcat=shampoos')

  const cardsWithSubcat = page.locator('.product-card')
  await expect(cardsWithSubcat.first()).toBeVisible({ timeout: 45000 })
  const subcatCount = await cardsWithSubcat.count()
  expect(subcatCount).toBeGreaterThan(0)

  await page.goto('/')

  const hairCategoryTrigger = page.getByRole('button', {
    name: /Уход за волосами|Hair Care|Matu aprūpe/i
  })

  await expect(hairCategoryTrigger).toBeVisible({ timeout: 45000 })
  await hairCategoryTrigger.click()

  const allLink = page.getByRole('menuitem', { name: /^Все$|^All$|^Visi$/ }).first()
  await expect(allLink).toBeVisible()
  await allLink.click()

  await page.waitForURL(/\/catalog\?cat=hair$/)
  await expect(page).toHaveURL(/\/catalog\?cat=hair$/)

  const cardsAfterReset = page.locator('.product-card')
  await expect(cardsAfterReset.first()).toBeVisible({ timeout: 45000 })
  const resetCount = await cardsAfterReset.count()
  expect(resetCount).toBeGreaterThan(subcatCount)
})
