/**
 * Recovery script: scripts/backfill-descriptions.ts overwrote Product.technicalSpecs
 * wholesale instead of merging, wiping the __variantGroupsJson key that
 * scripts/migrate-product-variants.ts (see worktree product-variant-options-v2) had
 * backfilled earlier for ~183 products. This re-derives the same data from the same
 * MSSQL source and merges it back in (COALESCE + jsonb ||, never overwrites other keys).
 *
 * Requires C:/Temp/migration/product_attributes.json (re-exported from MSSQL this session).
 * Run: npx tsx scripts/restore-variant-groups.ts
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

type VariantGroup = {
  name: string
  required: boolean
  options: { value: string; priceAdjustment?: number }[]
}

type AttrRow = {
  productId: number
  attrName: string
  isRequired: boolean | number
  value: string
  priceAdjustment: number | null
  displayOrder: number
}

function load(): AttrRow[] {
  const raw = readFileSync('C:/Temp/migration/product_attributes.json', 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const parsed = JSON.parse(noWraps)
  return (parsed.data ?? parsed) as AttrRow[]
}

function groupByProduct(rows: AttrRow[]): Map<string, VariantGroup[]> {
  const byProduct = new Map<string, Map<string, VariantGroup>>()
  for (const r of rows) {
    const pid = String(r.productId)
    if (!byProduct.has(pid)) byProduct.set(pid, new Map())
    const groups = byProduct.get(pid)!
    if (!groups.has(r.attrName)) {
      groups.set(r.attrName, { name: r.attrName, required: Boolean(r.isRequired), options: [] })
    }
    const option: { value: string; priceAdjustment?: number } = { value: r.value }
    if (r.priceAdjustment) option.priceAdjustment = Number(r.priceAdjustment)
    groups.get(r.attrName)!.options.push(option)
  }
  const result = new Map<string, VariantGroup[]>()
  for (const [pid, groups] of byProduct) {
    result.set(pid, Array.from(groups.values()))
  }
  return result
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000 })

async function main() {
  const rows = load()
  const grouped = groupByProduct(rows)
  console.log(`Restoring variantGroups for ${grouped.size} products (merge into technicalSpecs, not overwrite)...`)

  let updated = 0
  let notFound = 0
  for (const [productId, variantGroups] of grouped) {
    const result = await pool.query(
      `UPDATE "Product"
       SET "technicalSpecs" = COALESCE("technicalSpecs", '{}'::jsonb) || jsonb_build_object('__variantGroupsJson', $1::text)
       WHERE id = $2`,
      [JSON.stringify(variantGroups), productId]
    )
    if (result.rowCount && result.rowCount > 0) updated++
    else notFound++
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}`)
  await pool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
