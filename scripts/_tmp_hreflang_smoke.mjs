import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3005'
const results = []
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

const run = async () => {
  const browser = await chromium.launch()

  // 1) Guest on / : ru, no hydration errors, switcher → /en
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    ok('home html lang=ru', (await page.getAttribute('html', 'lang')) === 'ru')

    // language switcher: open dropdown, click EN
    await page.click('button[aria-label="Change language"]')
    await page.click('text=English')
    await page.waitForURL('**/en', { timeout: 10000 })
    ok('switcher navigates to /en', page.url() === BASE + '/en', page.url())
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    ok('html lang=en after switch', true)
    const cookies = await ctx.cookies()
    const langCookie = cookies.find((c) => c.name === 'eshop_language')
    ok('cookie eshop_language=en set', langCookie?.value === 'en')

    // unprefixed internal link keeps user in /en via middleware
    await page.goto(BASE + '/catalog', { waitUntil: 'domcontentloaded' })
    ok('unprefixed /catalog redirected to /en/catalog', page.url() === BASE + '/en/catalog', page.url())

    const hydration = errors.filter((e) => /hydrat|did not match|Minified React error/i.test(e))
    ok('no hydration errors', hydration.length === 0, hydration.slice(0, 2).join(' | '))
    await ctx.close()
  }

  // 2) Legacy visitor: localStorage lv, no cookie → auto-migrate to /lv
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      try {
        localStorage.setItem('eshop_language', 'lv')
      } catch {}
    })
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.waitForURL('**/lv', { timeout: 10000 }).catch(() => {})
    ok('legacy localStorage lv migrated to /lv', page.url() === BASE + '/lv', page.url())
    const cookies = await ctx.cookies()
    ok('migration set cookie lv', cookies.find((c) => c.name === 'eshop_language')?.value === 'lv')
    await ctx.close()
  }

  // 3) /en direct visit without cookie: page in EN, cookie synced to en
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(BASE + '/en/catalog', { waitUntil: 'networkidle' })
    ok('direct /en/catalog html lang=en', (await page.getAttribute('html', 'lang')) === 'en')
    await page.waitForFunction(() => document.cookie.includes('eshop_language=en'), null, { timeout: 5000 }).catch(() => {})
    const cookies = await ctx.cookies()
    ok('direct visit synced cookie en', cookies.find((c) => c.name === 'eshop_language')?.value === 'en')
    await ctx.close()
  }

  await browser.close()
  console.log(results.join('\n'))
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
