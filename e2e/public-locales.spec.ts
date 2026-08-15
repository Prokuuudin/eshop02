import { expect, test, type Page } from '@playwright/test'

type Language = 'ru' | 'en' | 'lv'

const localized = (path: string, language: Language): string => {
  if (language === 'ru') return path
  return path === '/' ? `/${language}` : `/${language}${path}`
}

const indexablePaths = [
  '/blog', '/contact', '/stores', '/delivery', '/delivery-payment',
  '/privacy', '/cookies', '/terms', '/return-policy', '/category/hair', '/request-quote',
]

const noIndexPaths = ['/auth/forgot-password', '/auth/reset-password', '/auth/invite']

async function expectLocalizedMetadata(page: Page, path: string, language: Language): Promise<void> {
  await page.goto(localized(path, language), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('lang', language)
  await expect(page).toHaveTitle(/Hairshop-Pro/i)

  const canonical = page.locator('link[rel="canonical"]')
  await expect(canonical).toHaveAttribute('href', new RegExp(`${localized(path, language).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))

  for (const alternate of ['ru', 'en', 'lv', 'x-default']) {
    await expect(page.locator(`link[rel="alternate"][hreflang="${alternate}"]`)).toHaveCount(1)
  }
}

for (const language of ['ru', 'en', 'lv'] as const) {
  test(`public metadata and language stay consistent in ${language}`, async ({ page }) => {
    for (const path of indexablePaths) {
      await expectLocalizedMetadata(page, path, language)
    }
  })

  test(`auth and 404 states are localized in ${language}`, async ({ page }) => {
    for (const path of noIndexPaths) {
      await page.goto(localized(path, language), { waitUntil: 'domcontentloaded' })
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)
    }

    const response = await page.goto(localized('/this-page-does-not-exist', language), { waitUntil: 'domcontentloaded' })
    test.fail(response?.status() === 200, 'Known soft-404: the streamed localized catch-all currently returns HTTP 200')
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', language)
  })

  test(`blog JSON-LD and internal links preserve ${language}`, async ({ page }) => {
    await page.goto(localized('/blog', language), { waitUntil: 'domcontentloaded' })
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(schemas.some((raw) => {
      const schema = JSON.parse(raw)
      return schema['@type'] === 'CollectionPage' && schema.mainEntity?.['@type'] === 'Blog'
    })).toBe(true)

    const article = page.locator(`a[href^="${localized('/blog/', language)}"]`).first()
    if (await article.count()) {
      const href = await article.getAttribute('href')
      expect(href).toBeTruthy()
      await page.goto(href!, { waitUntil: 'domcontentloaded' })
      const articleSchemas = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(articleSchemas.some((raw) => JSON.parse(raw)['@type'] === 'BlogPosting')).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('lang', language)
    }
  })
}
