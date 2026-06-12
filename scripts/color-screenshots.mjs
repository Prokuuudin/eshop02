import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000'
const LABEL = process.argv[2] || 'before'
const ROUTES = [
  ['home', '/'],
  ['catalog', '/catalog'],
  ['product', '/product/p1'],
  ['cart', '/cart'],
  ['checkout', '/checkout'],
]
const THEMES = ['light', 'dark']

const outDir = `test-results/color-${LABEL}`
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
for (const theme of THEMES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
  })
  const page = await ctx.newPage()
  for (const [name, route] of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.screenshot({ path: `${outDir}/${name}-${theme}.png`, fullPage: true })
      console.log(`captured ${name} ${theme}`)
    } catch (e) {
      console.warn(`skip ${name} ${theme}: ${e.message}`)
    }
  }
  await ctx.close()
}
await browser.close()
console.log(`Screenshots in ${outDir}`)
