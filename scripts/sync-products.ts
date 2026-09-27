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

config({ path: '.env.local' })

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function runDryRun(prisma: import('@/lib/prisma').ExtendedPrismaClient): Promise<number> {
  const fingerprint = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; syncRunCount: number; fingerprint: string }>>(
    `SELECT COUNT(*)::int AS count,
            COUNT(p."externalId")::int AS "externalIdCount",
            (SELECT COUNT(*)::int FROM "SyncRun") AS "syncRunCount",
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
  const critical: string[] = []
  if (!audit.validXml) critical.push(`invalid XML: ${audit.validationError ?? 'unknown validation error'}`)
  if (audit.itemCount === 0) critical.push('XML contains no products')
  if (audit.emptySkus > 0) critical.push(`${audit.emptySkus} products have an empty SKU/externalId`)
  if (audit.duplicateExternalIds.length > 0) critical.push(`${audit.duplicateExternalIds.length} duplicate externalId/SKU groups`)
  if (audit.invalidPrices.length > 0) critical.push(`${audit.invalidPrices.length} invalid price values`)
  if (audit.invalidStocks.length > 0) critical.push(`${audit.invalidStocks.length} invalid stock values`)
  if (audit.missingWarehouseIndexes.length > 0) critical.push(`required warehouse indexes missing: ${audit.missingWarehouseIndexes.join(', ')}`)
  if (audit.unexpectedWarehouseIndexes.length > 0) critical.push(`unexpected warehouse indexes: ${audit.unexpectedWarehouseIndexes.join(', ')}`)

  if (!audit.validXml || audit.itemCount === 0) {
    const catalogAfter = await fingerprint()
    console.log(JSON.stringify({ event: 'sync_dry_run_report', mode: 'dry-run', databaseWrites: 0, catalogUnchanged: JSON.stringify(catalogBefore) === JSON.stringify(catalogAfter), catalogBefore, catalogAfter, source: { kind: source.kind, modifiedAt: source.modifiedAt, sizeBytes: Buffer.byteLength(source.content), sha256: checksum }, xml: audit, critical }, null, 2))
    return 2
  }

  const products = parseGrinsXml(source.content)
  const [dbProducts, extraData] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false },
      select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true },
    }),
    getErpExtraData(prisma),
  ])
  const diff = buildSyncDryRunReport(products, dbProducts, extraData)
  if (diff.duplicateExternalIds.length > 0) critical.push(`${diff.duplicateExternalIds.length} externalId conflicts across XML/database`)

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
    xml: audit, diff, critical, warnings,
  }, null, 2))
  return critical.length ? 2 : 0
}

async function assertBackfillDone(prisma: import('@/lib/prisma').ExtendedPrismaClient): Promise<void> {
  if (process.argv.includes('--allow-first-run')) return

  const backfilledCount = await prisma.product.count({ where: { externalId: { not: null } } })
  if (backfilledCount === 0) {
    throw new Error(
      'Refusing to run: no Product rows have externalId set yet. This looks like the ' +
        'one-time externalId backfill (Product.sku -> GrinS feed sku) has not been run. ' +
        'Running this sync now would duplicate ~2,231 already-curated products as new ' +
        'pending rows instead of matching them. See the warning block at the top of this ' +
        'file. If you have already completed the backfill and this is a fresh/empty ' +
        'database, pass --allow-first-run to proceed anyway.',
    )
  }
}

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    if (process.argv.includes('--dry-run')) {
      process.exitCode = await runDryRun(prisma)
      return
    }
    const [{ GrinsXmlAdapter }, { runSync }] = await Promise.all([
      import('@/lib/sync/adapters/grins-xml'),
      import('@/lib/sync/sync-runner'),
    ])
    const adapter = new GrinsXmlAdapter()
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
