import { readFileSync } from 'fs'
import { config } from 'dotenv'
import {
  applyFirstWaveAtomic, assertImmutableAllowlist, FIRST_WAVE_XML_SHA256, requireAllowlistForApply, sha256, validateFirstWave,
  type AtomicStore, type FirstWaveAllowlist, type FirstWaveEntry,
} from '@/lib/sync/first-wave-backfill'
import { assertNoKnownWrongExternalIdLinks } from '@/lib/sync/known-wrong-external-id-links'

config({ path: '.env.local' })

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const apply = process.argv.includes('--apply')
  const file = valueAfter('--file')
  const allowlistFile = valueAfter('--allowlist')
  if (!file) throw new Error('--file is required')
  requireAllowlistForApply(apply, allowlistFile)
  if (!allowlistFile) throw new Error('--allowlist is required')
  const xml = readFileSync(file, 'utf8')
  const allowlistContent = readFileSync(allowlistFile)
  assertImmutableAllowlist(allowlistContent)
  const allowlist = JSON.parse(allowlistContent.toString('utf8')) as FirstWaveAllowlist
  if (sha256(xml) !== FIRST_WAVE_XML_SHA256) throw new Error('XML SHA-256 mismatch')
  const review = JSON.parse(readFileSync('external-id-review-audit.json', 'utf8'))
  if (review.source?.sha256 !== FIRST_WAVE_XML_SHA256) throw new Error('REVIEW audit belongs to another XML')
  const excludedIds = new Set<string>([
    ...review.duplicateGroups.flatMap((group: { products: Array<{ id: string }> }) => group.products.map(product => product.id)),
    ...review.caseOnly.map((item: { product: { id: string } }) => item.product.id),
  ])

  const { prisma } = await import('@/lib/prisma')
  const fingerprint = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; fingerprint: string; externalIds: number }>>(
    `SELECT COUNT(*)::int count, md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint,
            COUNT(*) FILTER (WHERE "externalId" IS NOT NULL)::int "externalIds" FROM "Product" p`,
  ))[0]
  try {
    const before = { product: await fingerprint(), syncRuns: await prisma.syncRun.count() }
    if (before.product.fingerprint !== allowlist.catalogFingerprint) throw new Error('Catalog fingerprint differs from allowlist baseline')
    const ids = allowlist.entries.map(entry => entry.productId)
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, isDeleted: true } })
    const counts = validateFirstWave(allowlist, xml, products, excludedIds)
    let updated = 0
    if (apply) {
      const store: AtomicStore = {
        transaction: operation => prisma.$transaction(async tx => operation({
          getProducts: txIds => tx.product.findMany({ where: { id: { in: txIds } }, select: { id: true, sku: true, externalId: true, isDeleted: true } }),
          updateExternalIds: async entries => {
            assertNoKnownWrongExternalIdLinks(entries.map(entry => ({ productId: entry.productId, externalId: entry.externalIdToSet })))
            const result = await tx.$executeRawUnsafe(
              `UPDATE "Product" AS p SET "externalId" = v.external_id
                 FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS x(id, sku, external_id)) AS v
                WHERE p.id = v.id AND p.sku = v.sku AND p."externalId" IS NULL AND p."isDeleted" = false`,
              entries.map(entry => entry.productId), entries.map(entry => entry.productSku), entries.map(entry => entry.externalIdToSet),
            )
            return result
          },
        }), { maxWait: 10_000, timeout: 60_000 }),
      }
      updated = await applyFirstWaveAtomic(store, allowlist, xml, excludedIds)
    }
    const after = { product: await fingerprint(), syncRuns: await prisma.syncRun.count() }
    if (!apply && JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Database changed during dry-run')
    const sample = (entries: FirstWaveEntry[]) => entries.slice(0, 5).map(entry => ({
      productId: entry.productId, sku: entry.productSku, externalIdBefore: null, externalIdAfter: entry.externalIdToSet, matchType: entry.matchType,
    }))
    console.log(JSON.stringify({
      event: 'first_wave_backfill', mode: apply ? 'apply' : 'dry-run', xmlSha256: sha256(xml), allowlistSha256: sha256(allowlistContent),
      candidates: allowlist.entries.length, exactSafe: counts.exact, leadingZeroExactSafe: counts.leadingZero,
      wouldUpdate: allowlist.entries.length, updated, skipped: 0, conflicts: 0, databaseWrites: apply ? updated : 0,
      sample: sample(allowlist.entries), leadingZeroSample: sample(allowlist.entries.filter(entry => entry.matchType === 'LEADING_ZERO_EXACT_SAFE')),
      before, after,
    }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(String(error)); process.exitCode = 1 })
