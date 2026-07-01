/**
 * Fixes the residual products whose Product.description still has raw HTML entities
 * (&scaron; etc). These weren't covered by backfill-descriptions.ts because their
 * source FullDescription/ShortDescription in MSSQL is NULL — the content was entered
 * later directly via the admin panel, already containing unescaped entities. No text
 * is reworded, only entities decoded in place (same `he` decoder as the migration).
 *
 * Run: npx tsx scripts/decode-remaining-descriptions.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'
import { decode } from 'he'

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL,
  max: 3,
  connectionTimeoutMillis: 30000,
})

async function main() {
  const { rows } = await dbPool.query(
    `SELECT id, description FROM "Product" WHERE description ~ '&[a-zA-Z#0-9]+;'`
  )
  console.log(`Found ${rows.length} products with undecoded entities`)

  let n = 0
  for (const row of rows) {
    const fixed = decode(row.description).replace(/\s+/g, ' ').trim()
    await dbPool.query(`UPDATE "Product" SET description = $1 WHERE id = $2`, [fixed, row.id])
    n++
  }
  console.log(`✓ decoded ${n} descriptions`)
  await dbPool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
