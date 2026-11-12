import { expect, test, type Page } from '@playwright/test'

// After a language change the route re-renders (and a cold dev server compiles it): a click that
// lands before hydration finishes is lost, so retry opening the menu until the option appears.
const chooseLanguage = async (page: Page, option: RegExp): Promise<void> => {
  const item = page.getByRole('button', { name: option }).filter({ visible: true })
  await expect(async () => {
    if (!(await item.isVisible())) await page.getByRole('button', { name: 'Change language' }).filter({ visible: true }).first().click()
    await expect(item).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await item.click()
}

test('language switcher keeps the current route and updates the document language', async ({ page }) => {
  await page.goto('/auth/register')

  await chooseLanguage(page, /English/)
  await expect(page).toHaveURL(/\/en\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await chooseLanguage(page, /Latvie/)
  await expect(page).toHaveURL(/\/lv\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'lv')

  await chooseLanguage(page, /Русский/)
  await expect(page).toHaveURL(/\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
})
