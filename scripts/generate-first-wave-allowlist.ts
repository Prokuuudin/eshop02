import { readFileSync, writeFileSync } from 'fs'
import { config } from 'dotenv'
import {
  FIRST_WAVE_EXACT, FIRST_WAVE_LEADING_ZERO, FIRST_WAVE_TOTAL, FIRST_WAVE_XML_SHA256,
  rawXmlSkuCounts, sha256, type FirstWaveAllowlist, type FirstWaveEntry,
} from '@/lib/sync/first-wave-backfill'

config({ path: '.env.local' })
const OUTPUT = 'first-wave-external-id-allowlist.json'
const EXPECTED_FINGERPRINT = '0a72c69f2300b7c978ac14ca35d4e7b1'

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const xml = readFileSync('export.xml', 'utf8')
    if (sha256(xml) !== FIRST_WAVE_XML_SHA256) throw new Error('Refusing to generate: XML SHA-256 mismatch')
    const review = JSON.parse(readFileSync('external-id-review-audit.json', 'utf8'))
    if (review.source?.sha256 !== FIRST_WAVE_XML_SHA256) throw new Error('REVIEW audit belongs to another XML')
    const excluded = new Set<string>([
      ...review.duplicateGroups.flatMap((group: { products: Array<{ id: string }> }) => group.products.map(product => product.id)),
      ...review.caseOnly.map((item: { product: { id: string } }) => item.product.id),
    ])
    const fingerprint = (await prisma.$queryRawUnsafe<Array<{ count: number; fingerprint: string; externalIds: number }>>(
      `SELECT COUNT(*)::int count, md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint,
              COUNT(*) FILTER (WHERE "externalId" IS NOT NULL)::int "externalIds" FROM "Product" p`,
    ))[0]
    if (fingerprint.count !== 6378 || fingerprint.fingerprint !== EXPECTED_FINGERPRINT || fingerprint.externalIds !== 0) throw new Error('Catalog baseline mismatch')
    const products = await prisma.product.findMany({ where: { isDeleted: false }, select: { id: true, sku: true, externalId: true, isDeleted: true } })
    const dbCounts = new Map<string, number>()
    for (const product of products) if (product.sku !== null) dbCounts.set(product.sku, (dbCounts.get(product.sku) ?? 0) + 1)
    const xmlCounts = rawXmlSkuCounts(xml)
    const entries: FirstWaveEntry[] = products.flatMap(product => {
      const sku = product.sku
      if (sku === null || sku === '' || product.externalId !== null || excluded.has(product.id)) return []
      if (dbCounts.get(sku) !== 1 || xmlCounts.get(sku) !== 1) return []
      return [{ productId: product.id, productSku: sku, xmlSku: sku, externalIdToSet: sku, matchType: /^0\d/u.test(sku) ? 'LEADING_ZERO_EXACT_SAFE' : 'EXACT_SAFE' } satisfies FirstWaveEntry]
    }).sort((a, b) => a.productId.localeCompare(b.productId))
    const exact = entries.filter(entry => entry.matchType === 'EXACT_SAFE').length
    const leading = entries.filter(entry => entry.matchType === 'LEADING_ZERO_EXACT_SAFE').length
    if (entries.length !== FIRST_WAVE_TOTAL || exact !== FIRST_WAVE_EXACT || leading !== FIRST_WAVE_LEADING_ZERO) throw new Error(`Unexpected allowlist counts: ${entries.length}/${exact}/${leading}`)
    const allowlist: FirstWaveAllowlist = { schemaVersion: 1, xmlSha256: FIRST_WAVE_XML_SHA256, catalogFingerprint: EXPECTED_FINGERPRINT, entries }
    writeFileSync(OUTPUT, JSON.stringify(allowlist, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ output: OUTPUT, entries: entries.length, exact, leading, sha256: sha256(readFileSync(OUTPUT)) }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
