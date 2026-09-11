// ============================================================================
// One-time backfill: Product.sku -> GrinS feed sku (Product.externalId).
//
// Why this exists: lib/sync/upsert-products.ts matches rows on externalId, not
// sku. Without this backfill, every already-curated product (imported via
// scripts/migrate-from-mssql.ts, externalId still null) would get duplicated
// as a brand-new pending row on the first real sync run instead of being
// matched and updated. See docs/superpowers/plans/2026-07-30-grins-xml-sync-adapter.md
// ("Global Constraints") for the full writeup.
//
// Usage:
//   tsx scripts/backfill-external-id.ts --file export.xml       (dry-run against a local file)
//   tsx scripts/backfill-external-id.ts                          (dry-run, fetches live feed via FTPS)
//   tsx scripts/backfill-external-id.ts --file export.xml --apply
//
// Dry-run is the default. Nothing is written to the DB unless --apply is passed.
// ============================================================================

import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseGrinsXml } from '@/lib/sync/grins-xml-parser'
import { getFtpsConfigFromEnv, downloadFtpsFile } from '@/lib/sync/ftps-client'
// lib/prisma.ts and lib/sync/xml-snapshot-store.ts construct the Prisma client
// eagerly at module-eval time. Static imports get hoisted above config() by the
// bundler regardless of source order, so DATABASE_URL wouldn't be loaded yet —
// both are imported dynamically inside main() instead (same pattern as
// scripts/apply-media-asset-table.ts).

const SAMPLE_LIMIT = 15

interface Args {
  file?: string
  apply: boolean
}

function parseArgs(argv: string[]): Args {
  const fileIdx = argv.indexOf('--file')
  return {
    file: fileIdx !== -1 ? argv[fileIdx + 1] : undefined,
    apply: argv.includes('--apply'),
  }
}

async function loadFeedXml(file?: string): Promise<string> {
  if (file) return readFileSync(file, 'utf-8')
  const { saveSnapshot } = await import('@/lib/sync/xml-snapshot-store')
  const ftpsConfig = getFtpsConfigFromEnv()
  const xml = await downloadFtpsFile(ftpsConfig)
  await saveSnapshot(xml)
  return xml
}

interface DbProduct {
  id: string
  sku: string | null
  externalId: string | null
}

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    await run(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

async function run(prisma: import('@/lib/prisma').ExtendedPrismaClient) {
  const { file, apply } = parseArgs(process.argv.slice(2))

  const xml = await loadFeedXml(file)
  const feedProducts = parseGrinsXml(xml)

  // sku === externalId in this feed (see lib/sync/grins-xml-parser.ts), so matching
  // Product.sku against feed sku is exactly matching against feed externalId.
  const feedBySku = new Map<string, number>()
  for (const p of feedProducts) {
    const sku = p.sku?.trim()
    if (!sku) continue
    feedBySku.set(sku, (feedBySku.get(sku) ?? 0) + 1)
  }
  const feedDuplicateSkus = new Set(
    [...feedBySku.entries()].filter(([, count]) => count > 1).map(([sku]) => sku),
  )

  const dbProducts: DbProduct[] = await prisma.product.findMany({
    where: { isDeleted: false },
    select: { id: true, sku: true, externalId: true },
  })

  const dbBySku = new Map<string, string[]>()
  for (const p of dbProducts) {
    const sku = p.sku?.trim()
    if (!sku) continue
    const ids = dbBySku.get(sku) ?? []
    ids.push(p.id)
    dbBySku.set(sku, ids)
  }
  const dbDuplicateSkus = new Set(
    [...dbBySku.entries()].filter(([, ids]) => ids.length > 1).map(([sku]) => sku),
  )

  const matched: { productId: string; sku: string }[] = []
  const unmatchedDbSkus: string[] = []
  const ambiguousDbDuplicateSkus: string[] = []
  const ambiguousFeedDuplicateSkus: string[] = []
  let alreadyLinked = 0
  let dbNoSku = 0

  for (const p of dbProducts) {
    if (p.externalId !== null) {
      alreadyLinked++
      continue
    }
    const sku = p.sku?.trim()
    if (!sku) {
      dbNoSku++
      continue
    }
    if (dbDuplicateSkus.has(sku)) {
      ambiguousDbDuplicateSkus.push(sku)
      continue
    }
    if (feedDuplicateSkus.has(sku)) {
      ambiguousFeedDuplicateSkus.push(sku)
      continue
    }
    if (!feedBySku.has(sku)) {
      unmatchedDbSkus.push(sku)
      continue
    }
    matched.push({ productId: p.id, sku })
  }

  const newFromFeedSkus: string[] = []
  for (const sku of feedBySku.keys()) {
    if (!dbBySku.has(sku)) newFromFeedSkus.push(sku)
  }

  const report = {
    event: 'backfill_report',
    mode: apply ? 'apply' : 'dry-run',
    feed: {
      items: feedProducts.length,
      uniqueSkus: feedBySku.size,
      duplicateSkuGroups: feedDuplicateSkus.size,
    },
    db: {
      total: dbProducts.length,
      alreadyLinked,
      noSku: dbNoSku,
      duplicateSkuGroups: dbDuplicateSkus.size,
    },
    result: {
      matched: matched.length,
      unmatchedDb: unmatchedDbSkus.length,
      ambiguousDbDuplicateSku: ambiguousDbDuplicateSkus.length,
      ambiguousFeedDuplicateSku: ambiguousFeedDuplicateSkus.length,
      newProductsFromFeed: newFromFeedSkus.length,
    },
    samples: {
      unmatchedDb: unmatchedDbSkus.slice(0, SAMPLE_LIMIT),
      ambiguousDbDuplicateSku: [...new Set(ambiguousDbDuplicateSkus)].slice(0, SAMPLE_LIMIT),
      ambiguousFeedDuplicateSku: [...new Set(ambiguousFeedDuplicateSkus)].slice(0, SAMPLE_LIMIT),
      newProductsFromFeed: newFromFeedSkus.slice(0, SAMPLE_LIMIT),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (!apply) {
    console.log(JSON.stringify({ event: 'backfill_dry_run_only', note: 'pass --apply to write externalId' }))
    return
  }

  if (matched.length === 0) {
    console.log(JSON.stringify({ event: 'backfill_apply_skipped', reason: 'nothing to match' }))
    return
  }

  const ids = matched.map(m => m.productId)
  const skus = matched.map(m => m.sku)
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "Product" AS p
     SET "externalId" = v.sku, "updatedAt" = now()
     FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS sku) AS v
     WHERE p.id = v.id`,
    ids,
    skus,
  )

  console.log(JSON.stringify({ event: 'backfill_applied', updated }))
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'backfill_fatal', error: String(err) }))
  process.exitCode = 1
})
