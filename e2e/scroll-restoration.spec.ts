import { expect, test } from '@playwright/test'

test('browser back restores the previous scroll position', async ({ page }) => {
  await page.goto('/terms')
  await expect(page.locator('.terms-page__content')).toBeVisible({ timeout: 45000 })

  await page.evaluate(() => {
    window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight - window.innerHeight))
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  const previousScrollY = await page.evaluate(() => window.scrollY)

  await page.locator('a[href^="/catalog"]').first().click()
  await page.waitForURL(/\/catalog/)
  await page.goBack()
  await page.waitForURL((url) => /\/(terms|ru\/terms|en\/terms|lv\/terms)$/.test(url.pathname))

  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 10000 })
    .toBeGreaterThan(previousScrollY - 100)
})
