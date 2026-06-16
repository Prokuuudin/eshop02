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
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// UTF-8 BOM is stripped automatically by readFileSync with 'utf8'
const raw = readFileSync('C:/Temp/migration/products_utf8.json', 'utf8').trim()
const noWraps = raw.replace(/\r\n|\r|\n/g, '')
const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
const { data } = JSON.parse(sanitized)

console.log(`Updating text fields for ${data.length} products...`)

let n = 0
const CONCURRENCY = 20

for (let i = 0; i < data.length; i += CONCURRENCY) {
  const slice = data.slice(i, i + CONCURRENCY)
  await Promise.all(slice.map(p =>
    pool.query(
      `UPDATE "Product" SET
        title = $1,
        description = $2,
        brand = $3,
        "metaTitle" = $4,
        "metaDescription" = $5
      WHERE id = $6`,
      [
        p.title || 'Untitled',
        p.description ? stripHtml(String(p.description)) : null,
        p.brand || 'Unknown',
        p.metaTitle ?? null,
        p.metaDescription ?? null,
        String(p.id),
      ]
    )
  ))
  n += slice.length
  if (n % 1000 === 0) process.stdout.write(`  ${n}/${data.length}\r`)
}

console.log(`\n✅ ${n} products text fields updated.`)
await pool.end()
