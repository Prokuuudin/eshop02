import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_CUSTOMER, fetchRealProduct, loginAs, type E2eUserFixture } from './helpers'

async function expectNoSeriousViolations(page: Page): Promise<void> {
  // Axe must inspect the settled page. During the route entrance animation the
  // whole content is translucent, which makes otherwise valid colors appear to
  // have insufficient contrast against the page background.
  await page.locator('.route-transition').waitFor({ state: 'visible' })
  await page.locator('.route-transition').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
}

async function seedClientUser(page: Page, user: E2eUserFixture): Promise<void> {
  await page.addInitScript((fixture) => {
    localStorage.setItem('eshop_users', JSON.stringify([fixture]))
    localStorage.setItem('eshop_current_user', JSON.stringify(fixture))
  }, user)
}

for (const path of ['/checkout', '/auth/login', '/auth/register', '/auth/forgot-password', '/contact', '/stores', '/privacy']) {
  test(`expanded axe scan on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expectNoSeriousViolations(page)
  })
}

test('product gallery and lightbox support axe and Escape', async ({ page }) => {
  const product = await fetchRealProduct(page)
  await page.goto(`/product/${product.id}`, { waitUntil: 'domcontentloaded' })
  await expectNoSeriousViolations(page)
  const galleryButton = page.locator('button').filter({ has: page.locator('img') }).first()
  if (await galleryButton.isVisible()) {
    await galleryButton.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible()) {
      await expectNoSeriousViolations(page)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  }
})

test('account profile and destructive dialog are keyboard-accessible', async ({ page }) => {
  await loginAs(page, E2E_CUSTOMER)
  await seedClientUser(page, E2E_CUSTOMER)
  await page.goto('/account/profile', { waitUntil: 'domcontentloaded' })
  await expectNoSeriousViolations(page)
  const deleteButton = page.getByRole('button', { name: /delete account|удалить аккаунт|dzēst kontu/i })
  if (await deleteButton.isVisible()) {
    await deleteButton.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectNoSeriousViolations(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(deleteButton).toBeFocused()
  }
})

test('admin products and global-search dialog pass axe', async ({ page }) => {
  await loginAs(page, E2E_ADMIN)
  await seedClientUser(page, E2E_ADMIN)
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' })
  await expectNoSeriousViolations(page)
  await page.keyboard.press('Control+K')
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) {
    await expectNoSeriousViolations(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme} checkout theme passes axe`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), colorScheme)
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' })
    await expectNoSeriousViolations(page)
  })
}

test('reduced motion disables animations and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const offenders = await page.locator('*').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element)
    return (style.animationName !== 'none' && parseFloat(style.animationDuration) > 0)
      || (style.transitionProperty !== 'none' && parseFloat(style.transitionDuration) > 0)
  }).slice(0, 10).map((element) => ({ tag: element.tagName, className: String(element.className) })))
  expect(offenders).toEqual([])
})

test('critical pages reflow at the 400% equivalent viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  for (const path of ['/', '/catalog', '/checkout', '/auth/login']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${path} has horizontal overflow`).toBeLessThanOrEqual(1)
  }
})
