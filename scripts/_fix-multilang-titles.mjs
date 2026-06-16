import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 3 })

function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

const raw = readFileSync('C:/Temp/migration/product_localized.json', 'utf8').trim()
const noWraps = raw.replace(/\r\n|\r|\n/g, '')
const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
const { data } = JSON.parse(sanitized)

// nopCommerce language IDs → project fields
// LangId 1 = en, 2 = lv, 3 = ru
// title(ru), titleEn(en), titleLv(lv)
// description = use lv FullDescription (primary store language)

const products = new Map()
for (const row of data) {
  const pid = row.productId
  if (!products.has(pid)) products.set(pid, {})
  const p = products.get(pid)
  const key = `${row.LanguageId}_${row.LocaleKey}`
  p[key] = row.val
}

console.log(`Building updates for ${products.size} products...`)

let n = 0
const entries = [...products.entries()]
const CONCURRENCY = 10

async function retry(fn) {
  for (let i = 1; i <= 5; i++) {
    try { return await fn() } catch (e) {
      if (i < 5 && (e.message?.includes('terminated') || e.message?.includes('connection')))
        await new Promise(r => setTimeout(r, i * 1500))
      else throw e
    }
  }
}

for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const slice = entries.slice(i, i + CONCURRENCY)
  await Promise.all(slice.map(([pid, p]) => {
    const titleRu  = p['3_Name'] || null          // Russian title → title
    const titleEn  = p['1_Name'] || null          // English title → titleEn
    const titleLv  = p['2_Name'] || null          // Latvian title → titleLv
    // description: prefer LV full, fallback LV short, then EN full
    const descRaw  = p['2_FullDescription'] || p['2_ShortDescription'] ||
                     p['1_FullDescription'] || p['1_ShortDescription'] || null
    const desc     = descRaw ? stripHtml(descRaw) : null

    return retry(() => pool.query(
      `UPDATE "Product" SET
        title       = COALESCE($1, title),
        "titleEn"   = $2,
        "titleLv"   = $3,
        description = COALESCE($4, description)
      WHERE id = $5`,
      [titleRu, titleEn, titleLv, desc, pid]
    ))
  }))
  n += slice.length
  if (n % 2000 === 0) process.stdout.write(`  ${n}/${entries.length}\r`)
}

console.log(`\n✅ ${n} products updated with per-language titles.`)
await pool.end()
