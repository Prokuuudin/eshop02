// ============================================================================
// PRODUCTION WARNING — READ BEFORE RUNNING THIS AGAINST REAL PRODUCTION DATA
// ============================================================================
// Do NOT run this adapter against production before a one-time externalId
// backfill has matched existing Product.sku values to the GrinS feed's <sku>.
//
// ~2,231 already-curated products (imported via scripts/migrate-from-mssql.ts)
// currently have externalId = null but a sku that almost certainly matches the
// feed's <sku> (both trace back to the same nopCommerce/GrinS-fed data). The
// upsert in lib/sync/upsert-products.ts matches rows on externalId, not sku —
// so without the backfill, every one of those 2,231 products gets duplicated
// as a brand-new pending row (isActive=false) instead of being matched and
// updated. The backfill itself is intentionally NOT implemented here: it needs
// the real ~16,025-row export.xml to build and verify against (only the
// 23-row sample is available as of this writing), and is its own follow-up
// task with its own reviewed plan. See docs/superpowers/plans/
// 2026-07-30-grins-xml-sync-adapter.md ("Global Constraints") for the full
// writeup.
//
// The guard below is a last-resort safety net, not a substitute for actually
// doing the backfill: it only checks that *some* product already has an
// externalId set, which is true immediately after a correct backfill and
// stays true forever after — it cannot detect a partial or wrong backfill.
// ============================================================================

import { config } from 'dotenv'
import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import { auditGrinsXml, parseGrinsXml } from '@/lib/sync/grins-xml-parser'
import { downloadFtpsFileWithMetadata, getFtpsConfigFromEnv } from '@/lib/sync/ftps-client'
import { getErpExtraData } from '@/lib/sync/erp-extra-data-store'
import { buildSyncDryRunReport } from '@/lib/sync/sync-dry-run'
import { evaluatePreflight, loadPreflightState, structuralFailures } from '@/lib/sync/sync-preflight'

config({ path: '.env.local' })

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function runDryRun(prisma: import('@/lib/prisma').ExtendedPrismaClient): Promise<number> {
  const fingerprint = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number; duplicateExternalIds: number; fingerprint: string }>>(
    `SELECT COUNT(*)::int AS count,
            COUNT(p."externalId")::int AS "externalIdCount",
            COUNT(*) FILTER (WHERE p."isActive")::int AS active,
            COUNT(*) FILTER (WHERE NOT p."isActive")::int AS inactive,
            (SELECT COUNT(*)::int FROM "SyncRun") AS "syncRunCount",
            (SELECT COUNT(*)::int FROM (SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*) > 1) duplicates) AS "duplicateExternalIds",
            md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint
       FROM "Product" p`,
  ))[0]
  const catalogBefore = await fingerprint()
  const file = argValue('--file') ?? process.argv.slice(2).find(arg => /\.xml$/iu.test(arg))
  const source = file
    ? { content: readFileSync(file, 'utf-8'), modifiedAt: statSync(file).mtime.toISOString(), kind: 'local-file' }
    : { ...(await downloadFtpsFileWithMetadata(getFtpsConfigFromEnv())), kind: 'ftps' }
  const checksum = createHash('sha256').update(source.content, 'utf-8').digest('hex')
  const audit = auditGrinsXml(source.content)
  const critical: string[] = structuralFailures(audit)

  if (!audit.validXml || audit.itemCount === 0) {
    const catalogAfter = await fingerprint()
    console.log(JSON.stringify({ event: 'sync_dry_run_report', mode: 'dry-run', databaseWrites: 0, catalogUnchanged: JSON.stringify(catalogBefore) === JSON.stringify(catalogAfter), catalogBefore, catalogAfter, source: { kind: source.kind, modifiedAt: source.modifiedAt, sizeBytes: Buffer.byteLength(source.content), sha256: checksum }, xml: audit, critical }, null, 2))
    return 2
  }

  const products = parseGrinsXml(source.content)
  const [dbProducts, extraData] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true },
    }),
    getErpExtraData(prisma),
  ])
  const diff = buildSyncDryRunReport(products, dbProducts, extraData)
  if (diff.duplicateExternalIds.length > 0) critical.push(`${diff.duplicateExternalIds.length} externalId conflicts across XML/database`)
  // Same read-only HARD/WARNING gates the scheduled run applies before its first write,
  // so a dry-run of a new source predicts whether the scheduled sync would accept it.
  const scheduledPreflight = evaluatePreflight({ audit, products, ...(await loadPreflightState(prisma)) })
  for (const failure of scheduledPreflight.hard) if (!critical.includes(failure)) critical.push(`scheduled preflight: ${failure}`)

  const warnings = [
    ...(audit.negativePrices.length ? [`${audit.negativePrices.length} negative price values`] : []),
    ...(audit.negativeStocks.length ? [`${audit.negativeStocks.length} negative stock values`] : []),
    ...(audit.caseCollisionGroups.length ? [`${audit.caseCollisionGroups.length} case-only SKU collision groups`] : []),
    ...(audit.whitespaceSkus.length ? [`${audit.whitespaceSkus.length} SKUs contain surrounding whitespace (parser trims them)`] : []),
    'No approved thresholds exist yet for unusually high create/deactivation counts; reported values require human approval.',
  ]
  const catalogAfter = await fingerprint()
  const catalogUnchanged = JSON.stringify(catalogBefore) === JSON.stringify(catalogAfter)
  if (!catalogUnchanged) critical.push('Product catalog fingerprint changed during dry-run')
  console.log(JSON.stringify({
    event: 'sync_dry_run_report', mode: 'dry-run', databaseWrites: 0, catalogUnchanged, catalogBefore, catalogAfter,
    source: { kind: source.kind, modifiedAt: source.modifiedAt, sizeBytes: Buffer.byteLength(source.content), sha256: checksum },
    xml: audit, diff, scheduledPreflight, critical, warnings,
  }, null, 2))
  return critical.length ? 2 : 0
}

async function assertBackfillDone(prisma: import('@/lib/prisma').ExtendedPrismaClient): Promise<void> {
  const [productCount, linkedCount] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { externalId: { not: null } } }),
  ])
  if (productCount !== 18544 || linkedCount !== 15754) {
    throw new Error(
      `Refusing FULL_PRODUCT_SYNC: reconciliation baseline drifted ` +
        `(Product=${productCount}, linked=${linkedCount}; expected 18544/15754). ` +
        'Reconcile explicitly; generic sync cannot import or assign externalId.',
    )
  }
}

// Hourly Plesk Scheduled Task entry point. Downloads the fresh feed and runs the
// same runSync() as --execute, but only after the fail-closed preflight passes.
// The SHA-pinned --execute path below is intentionally untouched.
async function runScheduled(): Promise<number> {
  const { runScheduledSync } = await import('@/lib/sync/scheduled-sync')
  const { runSync } = await import('@/lib/sync/sync-runner')
  const { sendSyncFailureAlert } = await import('@/lib/sync/sync-alert')
  let db: import('@/lib/prisma').ExtendedPrismaClient | undefined
  try {
    const outcome = await runScheduledSync({
      env: process.env,
      getDb: async () => (db = (await import('@/lib/prisma')).prisma),
      download: () => downloadFtpsFileWithMetadata(getFtpsConfigFromEnv()),
      runSync,
      sendAlert: sendSyncFailureAlert,
    })
    return outcome.exitCode
  } finally {
    await db?.$disconnect()
  }
}

async function main() {
  if (process.argv.includes('--scheduled')) {
    if (process.argv.includes('--execute') || process.argv.includes('--dry-run') || process.argv.includes('--file')) {
      throw new Error('--scheduled cannot be combined with --execute, --dry-run or --file')
    }
    process.exitCode = await runScheduled()
    return
  }
  const { prisma } = await import('@/lib/prisma')
  try {
    if (process.argv.includes('--dry-run')) {
      process.exitCode = await runDryRun(prisma)
      return
    }
    if (!process.argv.includes('--execute')) throw new Error('Refusing write mode without explicit --execute')
    const file = argValue('--file')
    if (!file) throw new Error('Controlled execute requires --file with the preflighted XML snapshot')
    const xml = readFileSync(file, 'utf8')
    const checksum = createHash('sha256').update(xml, 'utf8').digest('hex')
    if (checksum !== '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad') {
      throw new Error(`Refusing execute: XML SHA-256 drifted (${checksum})`)
    }
    const products = parseGrinsXml(xml)
    const adapter = { name: 'grins-xml-controlled-file', fetchPage: async () => ({ products, hasMore: false }) }
    const { runSync } = await import('@/lib/sync/sync-runner')
    await assertBackfillDone(prisma)
    const result = await runSync(adapter, prisma, 'manual')
    console.log(JSON.stringify({ event: 'sync_complete', ...result }))
    process.exitCode = result.status === 'completed' ? 0 : 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'sync_fatal', error: String(err) }))
  process.exitCode = 1
})
