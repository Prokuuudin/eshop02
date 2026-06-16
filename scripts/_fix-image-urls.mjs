import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 3 })

const raw = readFileSync('C:/Temp/migration/product_images2.json', 'utf8')
const { data } = JSON.parse(raw.replace(/\r\n|\r|\n/g, ''))

// Build: productId → [ordered image URLs] using size 400 instead of 160
const imageMap = new Map()
for (const r of data) {
  const url = `https://hairshop.lv/content/images/thumbs/${r.picId}_${r.seoFilename}_400.${r.ext}`
  const pid = String(r.productId)
  if (!imageMap.has(pid)) imageMap.set(pid, [])
  imageMap.get(pid).push({ url, order: Number(r.displayOrder) })
}

for (const [pid, imgs] of imageMap) {
  imgs.sort((a, b) => a.order - b.order)
  imageMap.set(pid, imgs.map(i => i.url))
}

console.log(`Updating ${imageMap.size} products to size 400...`)

let n = 0
const entries = [...imageMap.entries()]
const CONCURRENCY = 10

for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const slice = entries.slice(i, i + CONCURRENCY)
  await Promise.all(slice.map(([pid, imgs]) =>
    pool.query(
      `UPDATE "Product" SET image = $1, images = $2 WHERE id = $3`,
      [imgs[0], imgs, pid]
    )
  ))
  n += slice.length
  if (n % 1000 === 0) process.stdout.write(`  ${n}/${entries.length}\r`)
}

console.log(`\n✅ ${n} products updated to _400 size.`)
await pool.end()
