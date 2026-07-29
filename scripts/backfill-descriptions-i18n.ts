/**
 * Supersedes scripts/backfill-descriptions.ts, which only used the Latvian default
 * FullDescription column. The real source has per-language content in MSSQL's
 * LocalizedProperty table: LanguageId 1=EN, 2=LV, 3=RU. This project's convention
 * (confirmed against title/titleEn/titleLv) is base field = RU, *En = English,
 * *Lv = Latvian.
 *
 * Applies the same bold-label split (scripts/parse-descriptions.ts) per language:
 *   - description (base), feature1-4        <- RU (LanguageId 3)
 *   - feature1En-4En                        <- EN (LanguageId 1)
 *   - feature1Lv-4Lv                        <- LV (LanguageId 2)
 *   - technicalSpecs["<ingredients label>"] <- RU ingredients (INCI names are the
 *     same regardless of language in the source samples checked)
 *   - technicalSpecs.__descriptionEn / __descriptionLv <- EN/LV description, using
 *     the same reserved-`__`-key convention as __variantGroupsJson (no schema change)
 *
 * Requires C:/Temp/migration/localized_descriptions.json (productId, langId, text).
 * Run: npx tsx scripts/backfill-descriptions-i18n.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'
import { parseDescription } from './parse-descriptions'

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL,
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

type Row = { productId: number; langId: number; text: string }

async function main() {
  await withRetry(() => dbPool.query('SELECT 1'))

  const raw = readFileSync('C:/Temp/migration/localized_descriptions.json', 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
  const rows: Row[] = (JSON.parse(sanitized).data ?? [])

  const byProduct = new Map<string, { en?: string; lv?: string; ru?: string }>()
  for (const r of rows) {
    const id = String(r.productId)
    if (!byProduct.has(id)) byProduct.set(id, {})
    const entry = byProduct.get(id)!
    if (r.langId === 1) entry.en = r.text
    else if (r.langId === 2) entry.lv = r.text
    else if (r.langId === 3) entry.ru = r.text
  }

  console.log(`Products with localized descriptions: ${byProduct.size}`)

  const records = [...byProduct.entries()].map(([id, langs]) => {
    const ru = langs.ru ? parseDescription(langs.ru) : null
    const en = langs.en ? parseDescription(langs.en) : null
    const lv = langs.lv ? parseDescription(langs.lv) : null

    const technicalSpecs: Record<string, string> = {}
    if (ru) Object.assign(technicalSpecs, ru.technicalSpecs)
    if (en?.description) technicalSpecs.__descriptionEn = en.description
    if (lv?.description) technicalSpecs.__descriptionLv = lv.description

    return {
      id,
      description: ru?.description ?? null,
      feature1: ru?.features[0] ?? null,
      feature2: ru?.features[1] ?? null,
      feature3: ru?.features[2] ?? null,
      feature4: ru?.features[3] ?? null,
      feature1En: en?.features[0] ?? null,
      feature2En: en?.features[1] ?? null,
      feature3En: en?.features[2] ?? null,
      feature4En: en?.features[3] ?? null,
      feature1Lv: lv?.features[0] ?? null,
      feature2Lv: lv?.features[1] ?? null,
      feature3Lv: lv?.features[2] ?? null,
      feature4Lv: lv?.features[3] ?? null,
      technicalSpecs: Object.keys(technicalSpecs).length > 0 ? technicalSpecs : null,
    }
  })

  let n = 0
  const COLS = ['id', 'description', 'feature1', 'feature2', 'feature3', 'feature4',
    'feature1En', 'feature2En', 'feature3En', 'feature4En',
    'feature1Lv', 'feature2Lv', 'feature3Lv', 'feature4Lv', 'technicalSpecs']

  for (const batch of chunks(records, 100)) {
    const values: string[] = []
    const params: unknown[] = []
    batch.forEach((r, i) => {
      const base = i * COLS.length
      const casts = COLS.map((c, j) => `$${base + j + 1}::${c === 'technicalSpecs' ? 'text' : 'text'}`)
      values.push(`(${casts.join(',')})`)
      params.push(
        r.id, r.description, r.feature1, r.feature2, r.feature3, r.feature4,
        r.feature1En, r.feature2En, r.feature3En, r.feature4En,
        r.feature1Lv, r.feature2Lv, r.feature3Lv, r.feature4Lv,
        r.technicalSpecs ? JSON.stringify(r.technicalSpecs) : null,
      )
    })
    const sql = `
      UPDATE "Product" AS p SET
        description = v.description,
        feature1 = v.feature1, feature2 = v.feature2, feature3 = v.feature3, feature4 = v.feature4,
        "feature1En" = v."feature1En", "feature2En" = v."feature2En", "feature3En" = v."feature3En", "feature4En" = v."feature4En",
        "feature1Lv" = v."feature1Lv", "feature2Lv" = v."feature2Lv", "feature3Lv" = v."feature3Lv", "feature4Lv" = v."feature4Lv",
        "technicalSpecs" = CASE
          WHEN v."technicalSpecs" IS NOT NULL THEN COALESCE(p."technicalSpecs", '{}'::jsonb) || v."technicalSpecs"::jsonb
          ELSE p."technicalSpecs"
        END
      FROM (VALUES ${values.join(',')}) AS v(${COLS.map((c) => `"${c}"`).join(',')})
      WHERE p.id = v.id
    `
    const result = await withRetry(() => dbPool.query(sql, params))
    n += result.rowCount ?? 0
    process.stdout.write(`  ${n}/${records.length}\r`)
  }
  console.log(`\n✓ Updated ${n} products`)
  await dbPool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
