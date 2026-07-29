/**
 * One-off: backfill Product.description (decoded, no more raw HTML entities),
 * Product.feature1-4 and Product.technicalSpecs from the bold-labelled sub-sections
 * found in the source FullDescription. Uses scripts/parse-descriptions.ts — see that
 * file for the splitting rules. No wording is changed, only HTML stripped/decoded.
 * All target fields already exist in the schema — no migration needed.
 *
 * Requires C:/Temp/migration/full_descriptions.json (see export-mssql-to-json.ps1
 * or the ad-hoc SQLCMD export used earlier this session).
 *
 * Run: npx tsx scripts/backfill-descriptions.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'
import { parseDescription } from './parse-descriptions'

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
    } catch (e: unknown) {
      const error = e as { message?: string; code?: string }
      const retriable = error.message?.includes('connection error') ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('not queryable') ||
        error.message?.includes('timeout') ||
        error.code === 'P1001' || error.code === 'P1008' || error.code === 'ETIMEDOUT'
      if (retriable && attempt < 6) {
        console.log(`  retry ${attempt} after error: ${error.message}`)
        await new Promise((r) => setTimeout(r, attempt * 3000))
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
  await withRetry(() => dbPool.query('SELECT 1'))

  const raw = readFileSync('C:/Temp/migration/full_descriptions.json', 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
  const parsed = JSON.parse(sanitized)
  const rows: { id: string; fullDescription: string }[] = parsed.data ?? parsed

  console.log(`Rows to process: ${rows.length}`)

  const records = rows.map((r) => {
    const p = parseDescription(r.fullDescription)
    return {
      id: String(r.id),
      description: p.description,
      feature1: p.features[0] ?? null,
      feature2: p.features[1] ?? null,
      feature3: p.features[2] ?? null,
      feature4: p.features[3] ?? null,
      technicalSpecs: Object.keys(p.technicalSpecs).length > 0 ? p.technicalSpecs : null,
    }
  })

  let n = 0
  for (const batch of chunks(records, 150)) {
    const values: string[] = []
    const params: unknown[] = []
    batch.forEach((r, i) => {
      const base = i * 7
      values.push(
        `($${base + 1}::text, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text, $${base + 6}::text, $${base + 7}::jsonb)`
      )
      params.push(r.id, r.description, r.feature1, r.feature2, r.feature3, r.feature4, r.technicalSpecs ? JSON.stringify(r.technicalSpecs) : null)
    })
    // technicalSpecs is a shared JSON bag (e.g. also holds __variantGroupsJson from an
    // unrelated backfill) — merge the new keys in, never overwrite the whole object.
    const sql = `
      UPDATE "Product" AS p SET
        description = v.description,
        feature1 = v.feature1,
        feature2 = v.feature2,
        feature3 = v.feature3,
        feature4 = v.feature4,
        "technicalSpecs" = CASE
          WHEN v."technicalSpecs" IS NOT NULL THEN COALESCE(p."technicalSpecs", '{}'::jsonb) || v."technicalSpecs"
          ELSE p."technicalSpecs"
        END
      FROM (VALUES ${values.join(',')}) AS v(id, description, feature1, feature2, feature3, feature4, "technicalSpecs")
      WHERE p.id = v.id
    `
    const result = await withRetry(() => dbPool.query(sql, params))
    n += result.rowCount ?? 0
    process.stdout.write(`  ${n}/${rows.length}\r`)
  }
  console.log(`\n✓ Updated ${n} products`)
  await dbPool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
