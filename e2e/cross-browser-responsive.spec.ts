import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, fetchRealProduct, loginAs } from './helpers'

test.describe.configure({ timeout: 90_000 })

async function seedAdminClient(page: Page): Promise<void> {
  await page.addInitScript((admin) => {
    localStorage.setItem('eshop_users', JSON.stringify([admin]))
    localStorage.setItem('eshop_current_user', JSON.stringify(admin))
  }, E2E_ADMIN)
}

test('small phone and long RU/LV text do not create page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  for (const path of ['/privacy', '/lv/privacy', '/terms', '/lv/terms']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${path} overflows at 320px`).toBeLessThanOrEqual(1)
  }
})

test('landscape checkout keeps focused fields visible when viewport height shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' })
  const firstField = page.locator('input:not([type="hidden"])').first()
  await firstField.focus()
  await page.setViewportSize({ width: 844, height: 260 })
  await firstField.scrollIntoViewIfNeeded()
  const box = await firstField.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(260)
})

test('sticky header and cart drawer remain usable after scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.scrollTo(0, Math.max(500, document.body.scrollHeight / 2)))
  const header = page.locator('header').first()
  await expect(header).toBeVisible()
  expect((await header.boundingBox())?.y ?? 999).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: /открыть корзину|open cart|atvērt grozu/i }).click()
  const cart = page.getByTestId('cart-drawer-panel')
  await expect(cart).toBeVisible()
  const box = await cart.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(361)
})

test('product gallery supports pointer zoom or touch lightbox', async ({ page, browserName }) => {
  const product = await fetchRealProduct(page)
  await page.goto(`/product/${product.id}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator('.product-detail__zoom-root')
  await expect(root).toBeVisible({ timeout: 30_000 })
  if (browserName === 'webkit') {
    await root.locator(':scope > div').first().tap()
    await expect(page.getByRole('dialog')).toBeVisible()
  } else {
    const box = await root.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(page.locator('.product-detail__zoom-pane')).toHaveClass(/opacity-100/)
  }
})

test('admin product table fits and crop preview can be requested', async ({ page }) => {
  const product = await fetchRealProduct(page)
  await loginAs(page, E2E_ADMIN)
  await seedAdminClient(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/Проверка доступа к админке|Checking admin access/i)).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('#main-content')).toBeVisible()
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(pageOverflow).toBeLessThanOrEqual(1)

  await page.goto(`/admin/products/${product.id}`, { waitUntil: 'domcontentloaded' })
  const previewButton = page.getByRole('button', { name: /создать превью|create preview|izveidot priekšskatījumu/i })
  await expect(previewButton).toBeVisible({ timeout: 45_000 })
  await previewButton.click()
  await expect(previewButton).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator('body')).not.toContainText(/server_error|internal server error/i)
})

test('crop tool renders preview and applies the returned image to the product form', async ({ page }) => {
  const product = await fetchRealProduct(page)
  await loginAs(page, E2E_ADMIN)
  await seedAdminClient(page)
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  let action = ''
  await page.route('**/api/admin/products/image-crop', async (route) => {
    const requestBody = route.request().postDataJSON() as { action?: string }
    action = requestBody.action ?? ''
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(action === 'preview'
        ? { data: { skipped: false, originalUrl: pixel, preview: pixel, sourceSize: { width: 800, height: 800 }, crop: { width: 640, height: 640 } } }
        : { data: { image: '/api/media/crop-e2e.png', images: ['/api/media/crop-e2e.png'] } }),
    })
  })

  await page.goto(`/admin/products/${product.id}`, { waitUntil: 'domcontentloaded' })
  const previewButton = page.getByRole('button', { name: /создать превью|create preview|izveidot priekšskatījumu/i })
  await expect(previewButton).toBeVisible({ timeout: 45_000 })
  await previewButton.click()
  await expect(page.locator('figure img')).toHaveCount(2)
  await expect(page.locator('figure img').nth(1)).toBeVisible()
  await expect(page.locator('figcaption').last()).toContainText('640×640')

  const applyButton = page.getByRole('button', { name: /применить исправление|apply correction|lietot labojumu/i })
  await applyButton.click()
  expect(action).toBe('apply')
  await expect(page.locator('#add-product-image')).toHaveValue('/api/media/crop-e2e.png')
  await expect(page.locator('figure')).toHaveCount(0)
})
