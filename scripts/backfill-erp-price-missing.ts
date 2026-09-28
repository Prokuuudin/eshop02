/**
 * One-time backfill of Product.erpPriceMissing from the ERP feed (NOT from Product.price).
 *
 * erpPriceMissing = the linked ERP record's primary B2B price tier (price2) is not positive.
 * FULL sync maintains the flag afterwards; this only initialises existing linked rows.
 * Never touches price, stock, isActive, externalId or manualPriceApproved.
 *
 *   Dry-run (default, read-only, works before the migration is applied):
 *     npx tsx scripts/backfill-erp-price-missing.ts --out <dir> [--file export.xml]
 *   Apply (requires the migration and the fingerprint printed by the dry-run):
 *     npx tsx scripts/backfill-erp-price-missing.ts --out <dir> --apply --expect <fingerprint>
 *   Verify (read-only, after apply):
 *     npx tsx scripts/backfill-erp-price-missing.ts --out <dir> --verify
 *
 * Rollback: <out>/rollback.<fingerprint>.json lists every changed id with its previous
 * value; restore it with buildErpPriceMissingUpdate (raw SQL, leaves "updatedAt" alone).
 * Writes never touch Product."updatedAt" or any column other than "erpPriceMissing".
 */
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { parseGrinsXml } from '@/lib/sync/grins-xml-parser'
import { getSyncRules } from '@/lib/sync/sync-rules'
import { buildErpPriceMissingUpdate } from '@/lib/sync/erp-price-missing-backfill'

config({ path: '.env.local' })

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}
const OUT = arg('--out') ?? (() => { throw new Error('--out <dir> is required') })()
const FILE = arg('--file') ?? 'export.xml'
const APPLY = process.argv.includes('--apply')
const VERIFY = process.argv.includes('--verify')
const EXPECT = arg('--expect')

type Row = { id: string; sku: string | null; externalId: string; title: string; price: string; stock: number; isActive: boolean; erpPriceMissing: boolean | null; manualPriceApproved: boolean | null }

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const rules = getSyncRules()
    const feed = new Map(parseGrinsXml(readFileSync(FILE, 'utf8'), rules).map((item) => [item.externalId, item]))
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_name = 'Product' AND column_name IN ('erpPriceMissing', 'manualPriceApproved')`,
    )
    const migrated = columns.length === 2
    const rows = await prisma.$queryRawUnsafe<Row[]>(`
      SELECT id, sku, "externalId", title, price::text AS price, stock, "isActive",
             ${migrated ? '"erpPriceMissing", "manualPriceApproved"' : 'NULL::boolean AS "erpPriceMissing", NULL::boolean AS "manualPriceApproved"'}
        FROM "Product"
       WHERE "externalId" IS NOT NULL AND "isDeleted" = false
       ORDER BY id`)

    const notInFeed = rows.filter((row) => !feed.has(row.externalId))
    const evaluated = rows.filter((row) => feed.has(row.externalId)).map((row) => {
      const item = feed.get(row.externalId)!
      return {
        id: row.id, sku: row.sku, externalId: row.externalId, title: row.title,
        isActive: row.isActive, stock: row.stock, price: row.price,
        feedPrice: item.price, prices: item.prices ?? null,
        currentErpPriceMissing: row.erpPriceMissing ?? false,
        manualPriceApproved: row.manualPriceApproved ?? false,
        proposedErpPriceMissing: !(item.price > 0),
      }
    })
    const missing = evaluated.filter((row) => row.proposedErpPriceMissing)
    const changes = evaluated.filter((row) => row.proposedErpPriceMissing !== row.currentErpPriceMissing)
    const plan = changes.map((row) => ({ id: row.id, from: row.currentErpPriceMissing, to: row.proposedErpPriceMissing }))
    const fingerprint = createHash('sha256').update(JSON.stringify({ primaryPriceTier: rules.primaryPriceTier, plan })).digest('hex').slice(0, 16)

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: APPLY ? 'apply' : VERIFY ? 'verify' : 'dry-run',
      migrationApplied: migrated,
      primaryPriceTier: rules.primaryPriceTier,
      feedItems: feed.size,
      linkedNonDeleted: rows.length,
      linkedInFeed: evaluated.length,
      linkedNotInFeed: notInFeed.length,
      proposedErpPriceMissing: {
        total: missing.length,
        active: missing.filter((row) => row.isActive).length,
        inactive: missing.filter((row) => !row.isActive).length,
        activeWithStock: missing.filter((row) => row.isActive && row.stock > 0).length,
        manualPriceApproved: missing.filter((row) => row.manualPriceApproved).length,
      },
      changes: { total: plan.length, toTrue: plan.filter((p) => p.to).length, toFalse: plan.filter((p) => !p.to).length },
      fingerprint,
    }

    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, `plan.${fingerprint}.json`), JSON.stringify({ summary, plan, missing, notInFeed: notInFeed.map(({ id, sku, externalId }) => ({ id, sku, externalId })) }, null, 1))
    console.log(JSON.stringify(summary, null, 1))
    console.log('\nActive products that will be marked erpPriceMissing (id | sku | externalId | stock | price | p1/p2/p3/p4):')
    for (const row of missing.filter((r) => r.isActive)) {
      const p = row.prices
      console.log([row.id, row.sku ?? '—', row.externalId, row.stock, row.price, p ? `${p.price1}/${p.price2}/${p.price3}/${p.price4}` : '—'].join(' | '))
    }

    if (VERIFY) {
      if (!migrated) throw new Error('VERIFY_FAILED: migration not applied')
      if (plan.length !== 0) throw new Error(`VERIFY_FAILED: ${plan.length} rows differ from the feed`)
      console.log('\nVERIFY OK: erpPriceMissing matches the feed for every linked non-deleted product.')
      return
    }
    if (!APPLY) {
      console.log(`\nDRY-RUN only. No database writes were made. Plan: ${join(OUT, `plan.${fingerprint}.json`)}`)
      return
    }

    if (!migrated) throw new Error('APPLY_REFUSED: migration 20260928150000_product_erp_price_missing is not applied')
    if (EXPECT !== fingerprint) throw new Error(`APPLY_REFUSED: --expect ${EXPECT ?? '(missing)'} does not match plan fingerprint ${fingerprint}`)
    writeFileSync(join(OUT, `rollback.${fingerprint}.json`), JSON.stringify({ restore: plan.map((p) => ({ id: p.id, erpPriceMissing: p.from })) }, null, 1))
    const toTrue = plan.filter((p) => p.to).map((p) => p.id)
    const toFalse = plan.filter((p) => !p.to).map((p) => p.id)
    await prisma.$transaction(async (tx) => {
      // Raw SQL writes only "erpPriceMissing" (no implicit "updatedAt" stamp).
      const write = async (ids: string[], value: boolean) => {
        if (!ids.length) return 0
        const { sql, params } = buildErpPriceMissingUpdate(ids, value)
        return tx.$executeRawUnsafe(sql, ...params)
      }
      const a = await write(toTrue, true)
      const b = await write(toFalse, false)
      if (a !== toTrue.length || b !== toFalse.length) {
        throw new Error(`APPLY_ABORTED: expected ${toTrue.length}/${toFalse.length} updates, got ${a}/${b}; rolled back`)
      }
    })
    console.log(`\nAPPLIED: ${toTrue.length} → true, ${toFalse.length} → false. Rollback file: ${join(OUT, `rollback.${fingerprint}.json`)}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
