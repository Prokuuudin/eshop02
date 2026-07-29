/**
 * One-off: backfill Product.barcode (EAN/Gtin) from C:/Temp/migration/product_barcodes.json
 * Column already exists in schema — no migration needed.
 *
 * First run: SQLCMD export of {id, barcode} to C:/Temp/migration/product_barcodes.json
 * Then run:  npx tsx scripts/backfill-product-barcodes.ts
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
  keepAliveInitialDelayMillis: 10000,
  max: 3,
  connectionTimeoutMillis: 30000,
  statement_timeout: 60000,
})

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fn()
    } catch (e: unknown) {
      const error = e as { message?: string; code?: string }
      const retriable = error.message?.includes('connection error') ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('not queryable') ||
        error.message?.includes('timeout') ||
        error.code === 'P1001' || error.code === 'P1008' ||
        error.code === 'ETIMEDOUT'
      if (retriable && attempt < 6) {
        console.log(`  retry ${attempt} after error: ${error.message}`)
        await new Promise(r => setTimeout(r, attempt * 3000))
      } else {
        throw e
      }
    }
  }
  throw new Error('unreachable')
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function main() {
  const raw = readFileSync('C:/Temp/migration/product_barcodes.json', 'utf8').trim()
  // sqlcmd inserts \r\n every ~2034 bytes regardless of JSON context
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
  const parsed = JSON.parse(sanitized)
  const rows: { id: string; barcode: string }[] = parsed.data ?? parsed

  console.log(`Rows in export: ${rows.length}`)

  // warm up the connection first (Neon cold start can take a while)
  await withRetry(() => dbPool.query('SELECT 1'))

  let n = 0
  const BATCH = 200
  for (const batch of chunks(rows, BATCH)) {
    const values: string[] = []
    const params: string[] = []
    batch.forEach((r, i) => {
      values.push(`($${i * 2 + 1}::text, $${i * 2 + 2}::text)`)
      params.push(String(r.id), String(r.barcode))
    })
    const sql = `UPDATE "Product" AS p SET barcode = v.barcode FROM (VALUES ${values.join(',')}) AS v(id, barcode) WHERE p.id = v.id`
    const result = await withRetry(() => dbPool.query(sql, params))
    n += result.rowCount ?? 0
    process.stdout.write(`  ${n}\r`)
  }
  console.log(`\n✓ Updated ${n} products with barcode (EAN)`)
  await dbPool.end()
}

main().catch(e => {
  console.error('❌ Error:', e)
  process.exit(1)
})
