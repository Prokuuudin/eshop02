import { test, expect, type Page } from '@playwright/test'
import { E2E_CUSTOMER, fetchRealProduct, loginAs, titlePattern } from './helpers'

// Избранное auth-gated: гостю клик по сердечку открывает AuthGateDialog
// (модал прячет хедер через aria-hidden) — тест работает залогиненным.
const seedAuthedState = async (page: Page): Promise<void> => {
  await loginAs(page, E2E_CUSTOMER)
  await page.request.delete('/api/wishlist')
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem(
      'eshop_current_user',
      JSON.stringify({
        id: 'u_e2e_customer_fixture',
        email: 'e2e-customer@hairshop-pro.lv.local',
        platformRole: 'customer'
      })
    )
  })
}

test('wishlist add, header badge, and remove flow works', async ({ page }) => {
  test.setTimeout(60000)
  await seedAuthedState(page)
  // Живой товар вместо удалённого из БД p1
  const product = await fetchRealProduct(page)
  // H1 страницы товара показывает тайтл без бренд-префикса (бренд — отдельной строкой)
  const brand = String(product.brand ?? '').trim()
  const titleWithoutBrand = product.title.trim().toLowerCase().startsWith(brand.toLowerCase()) && brand
    ? product.title.trim().slice(brand.length).trim()
    : product.title
  await page.goto(`/product/${product.id}`)

  await expect(page.getByRole('heading', { name: titlePattern(titleWithoutBrand) })).toBeVisible({ timeout: 30000 })

  const addButton = page.locator('button[title="Добавить в избранное"], button[title="Add to wishlist"], button[title="Pievienot favorītiem"]').first()
  await expect(addButton).toBeVisible()
  await addButton.click()

  const wishlistLink = page.locator('a[href="/wishlist"]').first()
  await expect(wishlistLink).toBeVisible()
  await expect(wishlistLink).toContainText('1')

  await wishlistLink.click()
  await page.waitForURL(/\/wishlist$/)

  await expect(page.getByRole('heading', { name: /Избранное|Wishlist|Favorīti/i })).toBeVisible()
  await expect(page.getByText(/1 товаров в избранном|1 items in wishlist|1 preces favorītos/i)).toBeVisible()
  // Карточка избранного тоже показывает тайтл без бренд-префикса
  await expect(page.getByRole('link', { name: titlePattern(titleWithoutBrand) }).first()).toBeVisible()

  const removeButton = page.locator('button[title="Удалить из избранного"], button[title="Remove from wishlist"], button[title="Noņemt no favorītiem"]').first()
  await expect(removeButton).toBeVisible()
  await removeButton.click()

  await expect(page.getByText(/Ваш список избранного пуст|Your wishlist is empty|Favorītu saraksts ir tukšs/i)).toBeVisible()

  const wishlistStore = await page.evaluate(() => window.localStorage.getItem('wishlist-store'))
  expect(wishlistStore).toContain('"items":[]')
})
