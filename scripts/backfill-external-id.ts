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

async function loadFeedXml(file: string | undefined, saveToDatabase: boolean): Promise<string> {
  if (file) return readFileSync(file, 'utf-8')
  const ftpsConfig = getFtpsConfigFromEnv()
  const xml = await downloadFtpsFile(ftpsConfig)
  if (saveToDatabase) {
    const { saveSnapshot } = await import('@/lib/sync/xml-snapshot-store')
    await saveSnapshot(xml)
  }
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

  const xml = await loadFeedXml(file, apply)
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
  const externalIdOwners = new Map<string, string[]>()
  for (const p of dbProducts) {
    if (p.externalId) {
      const owners = externalIdOwners.get(p.externalId) ?? []
      owners.push(p.id)
      externalIdOwners.set(p.externalId, owners)
    }
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
  const conflictingExternalIds: Array<{ productId: string; sku: string; ownerIds: string[] }> = []
  const linkedSkuMismatches: Array<{ productId: string; sku: string | null; externalId: string }> = []
  const linkedExternalIdsMissingFromFeed: Array<{ productId: string; externalId: string }> = []
  let alreadyLinked = 0
  let dbNoSku = 0

  for (const p of dbProducts) {
    if (p.externalId !== null) {
      alreadyLinked++
      const sku = p.sku?.trim() || null
      if (sku !== p.externalId) linkedSkuMismatches.push({ productId: p.id, sku, externalId: p.externalId })
      if (!feedBySku.has(p.externalId)) linkedExternalIdsMissingFromFeed.push({ productId: p.id, externalId: p.externalId })
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
    const owners = externalIdOwners.get(sku) ?? []
    if (owners.some(id => id !== p.id)) {
      conflictingExternalIds.push({ productId: p.id, sku, ownerIds: owners })
      continue
    }
    matched.push({ productId: p.id, sku })
  }

  const newFromFeedSkus: string[] = []
  for (const sku of feedBySku.keys()) {
    if (!dbBySku.has(sku)) newFromFeedSkus.push(sku)
  }

  const dbRawSkus = dbProducts.map(product => product.sku).filter((sku): sku is string => sku !== null)
  const feedSkus = [...feedBySku.keys()]
  const dbTrimmed = new Set(dbRawSkus.map(sku => sku.trim()))
  const feedTrimmed = new Set(feedSkus.map(sku => sku.trim()))
  const caseOnlyMatches = dbRawSkus.filter(sku => !feedTrimmed.has(sku.trim()) && feedSkus.some(feedSku => feedSku.toLocaleLowerCase('en-US') === sku.trim().toLocaleLowerCase('en-US')))
  const whitespaceSkus = dbRawSkus.filter(sku => sku !== sku.trim())
  const leadingZeroSkus = [...new Set([...dbTrimmed, ...feedTrimmed].filter(sku => /^0\d/u.test(sku)))]

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
      conflictingExternalIds: conflictingExternalIds.length,
      linkedSkuMismatches: linkedSkuMismatches.length,
      linkedExternalIdsMissingFromFeed: linkedExternalIdsMissingFromFeed.length,
      newProductsFromFeed: newFromFeedSkus.length,
      onlyInDb: unmatchedDbSkus.length,
      onlyInXml: newFromFeedSkus.length,
      caseOnlyMatches: caseOnlyMatches.length,
      whitespaceSkus: whitespaceSkus.length,
      leadingZeroSkus: leadingZeroSkus.length,
    },
    samples: {
      unmatchedDb: unmatchedDbSkus.slice(0, SAMPLE_LIMIT),
      ambiguousDbDuplicateSku: [...new Set(ambiguousDbDuplicateSkus)].slice(0, SAMPLE_LIMIT),
      ambiguousFeedDuplicateSku: [...new Set(ambiguousFeedDuplicateSkus)].slice(0, SAMPLE_LIMIT),
      conflictingExternalIds: conflictingExternalIds.slice(0, SAMPLE_LIMIT),
      linkedSkuMismatches: linkedSkuMismatches.slice(0, SAMPLE_LIMIT),
      linkedExternalIdsMissingFromFeed: linkedExternalIdsMissingFromFeed.slice(0, SAMPLE_LIMIT),
      newProductsFromFeed: newFromFeedSkus.slice(0, SAMPLE_LIMIT),
      caseOnlyMatches: caseOnlyMatches.slice(0, SAMPLE_LIMIT),
      whitespaceSkus: whitespaceSkus.slice(0, SAMPLE_LIMIT),
      leadingZeroSkus: leadingZeroSkus.slice(0, SAMPLE_LIMIT),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (!apply) {
    console.log(JSON.stringify({ event: 'backfill_dry_run_only', databaseWrites: 0, note: 'pass --apply to write externalId' }))
    return
  }

  if (feedDuplicateSkus.size || dbDuplicateSkus.size || conflictingExternalIds.length || linkedSkuMismatches.length) {
    throw new Error('Refusing to apply backfill while SKU/externalId conflicts exist')
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
