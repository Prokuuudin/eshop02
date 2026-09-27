import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { getErpExtraData } from '../lib/sync/erp-extra-data-store'
import { FIRST_WAVE_SIZE, parseAndValidateAllowlist, sha256 } from '../lib/sync/controlled-first-wave'

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const [xml, allowlistContent] = await Promise.all([readFile('export.xml', 'utf8'), readFile('first-wave-external-id-allowlist.json', 'utf8')])
    const allowlist = parseAndValidateAllowlist(allowlistContent, sha256(xml)); const feedById = new Map(parseGrinsXml(xml).map(item => [item.externalId, item]))
    const products = await prisma.product.findMany({ where: { id: { in: allowlist.entries.map(row => row.productId) } }, select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true, lastSyncRunId: true } })
    const extra = await getErpExtraData(prisma); let priceMappingMismatches = 0, priceZeroRegressions = 0, stockMismatches = 0, identityMismatches = 0, extraPriceMismatches = 0, warehouseSnapshotMismatches = 0
    const active = products.filter(p => p.isActive).length; const runIds = new Set(products.map(p => p.lastSyncRunId))
    for (const p of products) {
      const item = feedById.get(p.externalId ?? ''); if (!item || p.isDeleted || p.sku !== p.externalId) { identityMismatches++; continue }
      if (item.price > 0 && Number(p.price) !== item.price) priceMappingMismatches++; if (item.price === 0 && Number(p.price) === 0) priceZeroRegressions++; if (p.stock !== item.stock) stockMismatches++
      const stored = extra[p.externalId!]; if (!stored || JSON.stringify(stored.prices) !== JSON.stringify(item.prices)) extraPriceMismatches++; if (!stored || JSON.stringify(stored.warehouseQuantities) !== JSON.stringify(item.warehouseQuantities)) warehouseSnapshotMismatches++
    }
    const lastRun = await prisma.syncRun.findFirst({ orderBy: { startedAt: 'desc' } })
    const state = (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; syncRunCount: number; fingerprint: string }>>(`SELECT COUNT(*)::int AS count, COUNT(p."externalId")::int AS "externalIdCount", (SELECT COUNT(*)::int FROM "SyncRun") AS "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint FROM "Product" p`))[0]
    console.log(JSON.stringify({ scope: products.length, expectedScope: FIRST_WAVE_SIZE, active, inactive: products.length - active, identityMismatches, priceMappingMismatches, priceZeroRegressions, stockMismatches, extraPriceMismatches, warehouseSnapshotMismatches, runIds: [...runIds], lastRun, state }, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
