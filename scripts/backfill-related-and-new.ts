/**
 * One-off: backfill Product.relatedProductIds, Product.oftenBoughtTogether and the
 * 'new' badge from source data that already exists in MSSQL but was dropped by the
 * original migration. All three target fields already exist in the Prisma schema —
 * no migration needed.
 *
 * First run (from an elevated shell with SQLCMD available):
 *   SQLCMD -S localhost\SQLEXPRESS -d hairshop_p34s -C -f 65001
 *     -Q "SELECT rp.ProductId1 AS productId, rp.ProductId2 AS relatedId FROM RelatedProduct rp JOIN Product p1 ON p1.Id=rp.ProductId1 AND p1.Deleted=0 JOIN Product p2 ON p2.Id=rp.ProductId2 AND p2.Deleted=0 FOR JSON PATH, ROOT('data')"
 *     -o C:/Temp/migration/related_products.json -y 0 -Y 0
 *   (same pattern for crosssell_products.json and mark_as_new.json — see export-mssql-to-json.ps1)
 * Then run: npx tsx scripts/backfill-related-and-new.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

const dbPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL,
  keepAlive: true,
  max: 3,
  connectionTimeoutMillis: 30000,
})

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      const retriable = e?.message?.includes('connection error') ||
        e?.message?.includes('Connection terminated') ||
        e?.message?.includes('not queryable') ||
        e?.message?.includes('timeout') ||
        e?.code === 'P1001' || e?.code === 'P1008' || e?.code === 'ETIMEDOUT'
      if (retriable && attempt < 6) {
        console.log(`  retry ${attempt} after error: ${e?.message}`)
        await new Promise((r) => setTimeout(r, attempt * 3000))
      } else {
        throw e
      }
    }
  }
  throw new Error('unreachable')
}

function loadJson<T>(path: string): T[] {
  const raw = readFileSync(path, 'utf8').trim()
  // sqlcmd inserts \r\n every ~2034 bytes regardless of JSON context
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
  const parsed = JSON.parse(sanitized)
  return parsed.data ?? parsed
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function backfillArrayField(
  fieldName: 'relatedProductIds' | 'oftenBoughtTogether',
  grouped: Map<string, string[]>
) {
  const entries = [...grouped.entries()]
  let n = 0
  for (const batch of chunks(entries, 200)) {
    const values: string[] = []
    const params: string[] = []
    batch.forEach(([id, ids], i) => {
      values.push(`($${i * 2 + 1}::text, $${i * 2 + 2}::text[])`)
      params.push(id, `{${ids.join(',')}}`)
    })
    const sql = `UPDATE "Product" AS p SET "${fieldName}" = v.ids FROM (VALUES ${values.join(',')}) AS v(id, ids) WHERE p.id = v.id`
    const result = await withRetry(() => dbPool.query(sql, params))
    n += result.rowCount ?? 0
  }
  console.log(`✓ ${fieldName}: updated ${n} products`)
}

async function main() {
  await withRetry(() => dbPool.query('SELECT 1'))

  const related = loadJson<{ productId: number; relatedId: number }>('C:/Temp/migration/related_products.json')
  const crossSell = loadJson<{ productId: number; crossSellId: number }>('C:/Temp/migration/crosssell_products.json')
  const markAsNew = loadJson<{ id: string }>('C:/Temp/migration/mark_as_new.json')

  const relatedMap = new Map<string, string[]>()
  for (const r of related) {
    const id = String(r.productId)
    if (!relatedMap.has(id)) relatedMap.set(id, [])
    relatedMap.get(id)!.push(String(r.relatedId))
  }

  const crossSellMap = new Map<string, string[]>()
  for (const r of crossSell) {
    const id = String(r.productId)
    if (!crossSellMap.has(id)) crossSellMap.set(id, [])
    crossSellMap.get(id)!.push(String(r.crossSellId))
  }

  console.log(`Related pairs: ${related.length} (${relatedMap.size} products)`)
  console.log(`Cross-sell pairs: ${crossSell.length} (${crossSellMap.size} products)`)
  console.log(`Marked as new: ${markAsNew.length} products`)

  await backfillArrayField('relatedProductIds', relatedMap)
  await backfillArrayField('oftenBoughtTogether', crossSellMap)

  // 'new' badge: append without clobbering any badges already set manually via admin.
  const newIds = markAsNew.map((r) => String(r.id))
  let badgeCount = 0
  for (const batch of chunks(newIds, 500)) {
    const result = await withRetry(() =>
      dbPool.query(
        `UPDATE "Product" SET badges = array_append(badges, 'new') WHERE id = ANY($1) AND NOT ('new' = ANY(badges))`,
        [batch]
      )
    )
    badgeCount += result.rowCount ?? 0
  }
  console.log(`✓ badges: added 'new' to ${badgeCount} products`)

  await dbPool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
