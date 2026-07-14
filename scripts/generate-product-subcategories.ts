/**
 * Bake per-product subcategory slugs into data/product-subcategories.json.
 *
 * Source: the recovered MSSQL Product_Category_Mapping export at
 * C:/Temp/product_category_map.json (same prerequisite as
 * scripts/recategorize-products.ts — no regeneration script exists) plus
 * the live Product.category from Neon, mapped through
 * data/subcategory-tags.ts. Products whose tags carry no subcategory
 * signal are omitted — they only show under the category's "All".
 *
 * Usage: npx tsx scripts/generate-product-subcategories.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
// WebSocket driver (port 443), not 'pg' — TCP 5432 is blocked by the VPN.
import { Pool } from '@neondatabase/serverless'
import { resolveSubcategorySlug } from '../data/subcategory-tags'

const MAP_PATH = 'C:/Temp/product_category_map.json'
const OUT_PATH = 'data/product-subcategories.json'

function loadJsonLenient(path: string): unknown {
  let raw = readFileSync(path, 'utf8')
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) <= 0x1F) continue
    out += raw[i]
  }
  return JSON.parse(out)
}

async function main() {
  const rows = loadJsonLenient(MAP_PATH) as { productId: number; catName: string }[]
  const tagsByProductId = new Map<string, string[]>()
  for (const row of rows) {
    const id = String(row.productId)
    const list = tagsByProductId.get(id) ?? []
    list.push(row.catName)
    tagsByProductId.set(id, list)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const products = await pool.query<{ id: string; category: string; isActive: boolean }>(
    'SELECT id, category, "isActive" FROM "Product" WHERE "isDeleted" = false'
  )
  await pool.end()

  const result: Record<string, string> = {}
  const coverage: Record<string, { total: number; withSlug: number }> = {}
  for (const p of products.rows) {
    if (p.isActive) {
      coverage[p.category] = coverage[p.category] ?? { total: 0, withSlug: 0 }
      coverage[p.category].total++
    }
    const slug = resolveSubcategorySlug(tagsByProductId.get(p.id) ?? [], p.category)
    if (slug) {
      result[p.id] = slug
      if (p.isActive) coverage[p.category].withSlug++
    }
  }

  const sorted = Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => Number(a) - Number(b))
  )
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 0) + '\n')

  console.log(`Wrote ${Object.keys(sorted).length} entries to ${OUT_PATH}`)
  console.log('Active-product coverage by category:')
  for (const [cat, c] of Object.entries(coverage)) {
    console.log(`  ${cat.padEnd(10)} ${c.withSlug}/${c.total} (${Math.round((c.withSlug / c.total) * 100)}%)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
