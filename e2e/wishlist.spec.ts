import { test, expect, type Page } from '@playwright/test'

const seedCleanState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

test('wishlist add, header badge, and remove flow works', async ({ page }) => {
  test.setTimeout(60000)
  await seedCleanState(page)
  await page.goto('/product/p1')

  await expect(page.getByRole('heading', { name: /Крем для лица Revitaluxe 50ml/i })).toBeVisible()

  const addButton = page.locator('button[title="Добавить в избранное"], button[title="Add to wishlist"], button[title="Pievienot favorītiem"]').first()
  await expect(addButton).toBeVisible()
  await addButton.click()

  const wishlistLink = page.getByRole('link', { name: /Избранное|Wishlist|Favorīti/i }).first()
  await expect(wishlistLink).toBeVisible()
  await expect(wishlistLink).toContainText('1')

  await wishlistLink.click()
  await page.waitForURL(/\/wishlist$/)

  await expect(page.getByRole('heading', { name: /Избранное|Wishlist|Favorīti/i })).toBeVisible()
  await expect(page.getByText(/1 товаров в избранном|1 items in wishlist|1 preces favorītos/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /Крем для лица Revitaluxe 50ml/i }).first()).toBeVisible()

  const removeButton = page.locator('button[title="Удалить из избранного"], button[title="Remove from wishlist"], button[title="Noņemt no favorītiem"]').first()
  await expect(removeButton).toBeVisible()
  await removeButton.click()

  await expect(page.getByText(/Ваш список избранного пуст|Your wishlist is empty|Favorītu saraksts ir tukšs/i)).toBeVisible()

  const wishlistStore = await page.evaluate(() => window.localStorage.getItem('wishlist-store'))
  expect(wishlistStore).toContain('"items":[]')
})