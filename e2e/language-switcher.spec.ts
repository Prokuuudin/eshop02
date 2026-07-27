import { expect, test } from '@playwright/test'

test('language switcher keeps the current route and updates the document language', async ({ page }) => {
  await page.goto('/auth/register')

  const switcher = page.getByRole('button', { name: 'Change language' }).filter({ visible: true }).first()
  await switcher.click()
  await page.getByRole('button', { name: /English/ }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/en\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'Change language' }).filter({ visible: true }).first().click()
  await page.getByRole('button', { name: /Latvie/ }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/lv\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'lv')

  await page.getByRole('button', { name: 'Change language' }).filter({ visible: true }).first().click()
  await page.getByRole('button', { name: /Русский/ }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/auth\/register$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
})
