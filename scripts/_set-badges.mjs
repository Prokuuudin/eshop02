/**
 * Populate badges for all DB products:
 *   bestseller  — top 50 by total ordered quantity (from Order.items JSON)
 *   sale        — oldPrice > price
 *   new         — top 15% newest by numeric nopCommerce id
 *
 * Existing custom badges on p* (test) products are preserved.
 * Run: node scripts/_set-badges.mjs
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 3 })

// ── 1. bestseller: top 50 by total quantity in orders ──────────────────────
const { rows: salesRows } = await pool.query(`
  SELECT item->>'id' AS pid, SUM((item->>'quantity')::int) AS qty
  FROM "Order", jsonb_array_elements(items::jsonb) AS item
  WHERE item->>'id' IS NOT NULL
  GROUP BY item->>'id'
  ORDER BY qty DESC
  LIMIT 50
`)
const bestsellerIds = new Set(salesRows.map(r => r.pid))
console.log(`bestseller candidates: ${bestsellerIds.size}`)

// ── 2. sale: oldPrice > price ──────────────────────────────────────────────
const { rows: saleRows } = await pool.query(`
  SELECT id FROM "Product"
  WHERE "isActive" = true AND id NOT LIKE 'p%'
    AND "oldPrice" IS NOT NULL AND "oldPrice" > price
`)
const saleIds = new Set(saleRows.map(r => r.id))
console.log(`sale candidates: ${saleIds.size}`)

// ── 3. new: top 15% by numeric id ─────────────────────────────────────────
const { rows: idRows } = await pool.query(`
  SELECT id FROM "Product"
  WHERE "isActive" = true AND id NOT LIKE 'p%'
  ORDER BY id::int DESC
  LIMIT (SELECT CEIL(COUNT(*) * 0.15) FROM "Product" WHERE "isActive" = true AND id NOT LIKE 'p%')
`)
const newIds = new Set(idRows.map(r => r.id))
console.log(`new candidates: ${newIds.size}`)

// ── 4. fetch all real (migrated) products ──────────────────────────────────
const { rows: products } = await pool.query(`
  SELECT id, badges FROM "Product" WHERE id NOT LIKE 'p%'
`)

// ── 5. compute new badges and update ──────────────────────────────────────
let updated = 0
const CONCURRENCY = 10

async function retry(fn) {
  for (let i = 1; i <= 5; i++) {
    try { return await fn() } catch (e) {
      if (i < 5 && (e.message?.includes('terminated') || e.message?.includes('connection')))
        await new Promise(r => setTimeout(r, i * 1000))
      else throw e
    }
  }
}

for (let i = 0; i < products.length; i += CONCURRENCY) {
  const slice = products.slice(i, i + CONCURRENCY)
  await Promise.all(slice.map(({ id }) => {
    const badges = []
    if (bestsellerIds.has(id)) badges.push('bestseller')
    if (saleIds.has(id))       badges.push('sale')
    if (newIds.has(id))        badges.push('new')
    return retry(() => pool.query(
      `UPDATE "Product" SET badges = $1 WHERE id = $2`,
      [badges, id]
    ))
  }))
  updated += slice.length
  if (updated % 1000 === 0) process.stdout.write(`  ${updated}/${products.length}\n`)
}

console.log(`\n✅ ${updated} products updated.`)
console.log(`  bestseller: ${bestsellerIds.size}, sale: ${saleIds.size}, new: ${newIds.size}`)
await pool.end()
