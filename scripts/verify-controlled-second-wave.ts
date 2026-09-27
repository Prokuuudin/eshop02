import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { getErpExtraData } from '../lib/sync/erp-extra-data-store'
import { parseSecondWaveAllowlist, SECOND_WAVE_SIZE, sha256 } from '../lib/sync/controlled-second-wave'

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const [xml, content] = await Promise.all([readFile('export.xml', 'utf8'), readFile('second-wave-case-only-allowlist.json', 'utf8')])
    const allowlist = parseSecondWaveAllowlist(content, sha256(xml)), allowedById = new Map(allowlist.entries.map(x => [x.productId, x])), feedById = new Map(parseGrinsXml(xml).map(x => [x.externalId, x]))
    const products = await prisma.product.findMany({ where: { id: { in: allowlist.entries.map(x => x.productId) } }, select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true, lastSyncRunId: true } })
    const extra = await getErpExtraData(prisma)
    let identityMismatches = 0, priceMappingMismatches = 0, stockFormulaMismatches = 0, extraPriceMismatches = 0, warehouseSnapshotMismatches = 0
    for (const product of products) {
      const allowed = allowedById.get(product.id), item = allowed ? feedById.get(allowed.xmlSku) : undefined
      if (!allowed || !item || product.isDeleted || product.externalId !== allowed.externalIdToSet || product.sku !== allowed.productSku) { identityMismatches++; continue }
      if (item.price > 0 && Number(product.price) !== item.price) priceMappingMismatches++
      if (product.stock !== item.stock) stockFormulaMismatches++
      const stored = extra[allowed.externalIdToSet]
      if (!stored || JSON.stringify(stored.prices) !== JSON.stringify(item.prices)) extraPriceMismatches++
      if (!stored || JSON.stringify(stored.warehouseQuantities) !== JSON.stringify(item.warehouseQuantities)) warehouseSnapshotMismatches++
    }
    const [state, duplicates, excluded, lastRun] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number }>>(`SELECT COUNT(*)::int count, COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE "isActive")::int active, COUNT(*) FILTER (WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount" FROM "Product"`),
      prisma.$queryRawUnsafe<Array<{ externalId: string; count: number }>>(`SELECT "externalId", COUNT(*)::int count FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*) > 1`),
      prisma.product.findMany({ where: { sku: { in: ['k18', 'k86'] } }, select: { id: true, sku: true, externalId: true } }),
      prisma.syncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ])
    const result = { scope: products.length, expectedScope: SECOND_WAVE_SIZE, identityMismatches, priceMappingMismatches, stockFormulaMismatches, extraRecordsChecked: products.length, extraPriceMismatches, warehouseSnapshotMismatches, duplicateExternalIds: duplicates.length, excluded, state: state[0], lastRun }
    console.log(JSON.stringify(result, null, 2))
    if (products.length !== SECOND_WAVE_SIZE || identityMismatches || priceMappingMismatches || stockFormulaMismatches || extraPriceMismatches || warehouseSnapshotMismatches || duplicates.length || excluded.some(x => x.externalId !== null)) throw new Error('SECOND_WAVE_POST_SYNC_VERIFICATION_FAILED')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
