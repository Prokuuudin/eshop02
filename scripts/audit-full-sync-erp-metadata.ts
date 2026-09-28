import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
import { parseGrinsXml } from '@/lib/sync/grins-xml-parser'
import { getErpExtraData, type ErpExtraData } from '@/lib/sync/erp-extra-data-store'
import { selectedStock } from '@/lib/sync/sync-rules'

config({ path: '.env.local' })

const EXPECTED = { count: 18544, linked: 15754, active: 2229, inactive: 16315, runs: Number(process.env.EXPECTED_SYNC_RUNS ?? 12), duplicates: 0, fingerprint: '54d1d85a3b11955dcac193b173366fa1' }
const canonicalObject = (value: Record<string, number> = {}) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, number]) => [key, Number(number)]))
const canonicalExtra = (value: ErpExtraData): ErpExtraData => ({ prices: { price1: Number(value.prices.price1 ?? 0), price2: Number(value.prices.price2 ?? 0), price3: Number(value.prices.price3 ?? 0), price4: Number(value.prices.price4 ?? 0) }, warehouseQuantities: canonicalObject(value.warehouseQuantities) })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function snapshot(prisma: import('@/lib/prisma').ExtendedPrismaClient) {
  return (await prisma.$queryRawUnsafe<Array<typeof EXPECTED>>(`SELECT COUNT(*)::int count,COUNT("externalId")::int linked,COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") runs,(SELECT COUNT(*)::int FROM(SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1)x) duplicates,md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY id),'')) fingerprint FROM "Product" p`))[0]
}

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const before = await snapshot(prisma)
    if (!same(before, EXPECTED)) throw new Error(`BASELINE_DRIFT:${JSON.stringify({ expected: EXPECTED, actual: before })}`)
    const xml = readFileSync('export.xml', 'utf8'); const feed = parseGrinsXml(xml)
    const xmlSha256 = createHash('sha256').update(xml).digest('hex')
    if (xmlSha256 !== '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad') throw new Error(`XML_SHA_DRIFT:${xmlSha256}`)
    const [products, stored] = await Promise.all([
      prisma.product.findMany({ select: { id: true, externalId: true, sku: true, barcode: true, price: true, stock: true, isActive: true, isDeleted: true } }),
      getErpExtraData(prisma),
    ])
    const feedById = new Map(feed.map(item => [item.externalId, item])); const productById = new Map(products.filter(p => p.externalId).map(p => [p.externalId!, p]))
    const counts = { price1Changed: 0, price2Changed: 0, price3Changed: 0, price4Changed: 0, warehouseSnapshotChanged: 0, aggregateAllowedStockChanged: 0, missingErpRecord: 0, exactNumericDifference: 0, twoDecimalPrecisionOnly: 0, nullZeroRepresentationDifference: 0, orderingOnlyDifference: 0, other: 0, erpUpdates: 0, pricePolicyMismatches: 0, stockPolicyMismatches: 0, excludedWarehouseLeakMismatches: 0, fullSnapshotMismatches: 0 }
    const price3Samples: unknown[] = []; const hypothetical: Record<string, ErpExtraData> = { ...stored }
    for (const product of products) {
      if (!product.externalId || product.isDeleted) continue
      const item = feedById.get(product.externalId); if (!item) continue
      const incoming = canonicalExtra({ prices: item.prices!, warehouseQuantities: item.warehouseQuantities ?? {} }); const currentRaw = stored[product.externalId]; const current = currentRaw && canonicalExtra(currentRaw)
      const expectedPrice = item.price > 0 ? item.price : Number(product.price)
      if (Number(product.price) !== expectedPrice) counts.pricePolicyMismatches++
      if (product.stock !== selectedStock(item.warehouseQuantities ?? {})) counts.stockPolicyMismatches++
      if (item.stock !== selectedStock(item.warehouseQuantities ?? {})) counts.excludedWarehouseLeakMismatches++
      if (!current) counts.missingErpRecord++
      const changed = !current || !same(current, incoming)
      if (changed) {
        counts.erpUpdates++
        for (const tier of ['price1','price2','price3','price4'] as const) if (!current || current.prices[tier] !== incoming.prices[tier]) {
          counts[`${tier}Changed` as keyof typeof counts]++
          if (current && current.prices[tier] !== incoming.prices[tier]) {
            counts.exactNumericDifference++
            if (current.prices[tier].toFixed(2) === incoming.prices[tier].toFixed(2)) counts.twoDecimalPrecisionOnly++
            if (tier === 'price3' && price3Samples.length < 10) price3Samples.push({ externalId: product.externalId, stored: current.prices.price3, xml: incoming.prices.price3, numericSemanticEquality: current.prices.price3 === incoming.prices.price3, equalAtTwoDecimals: current.prices.price3.toFixed(2) === incoming.prices.price3.toFixed(2), representationAfterSync: incoming.prices.price3 })
          }
        }
        if (!current || !same(current.warehouseQuantities, incoming.warehouseQuantities)) counts.warehouseSnapshotChanged++
        if (product.stock !== item.stock) counts.aggregateAllowedStockChanged++
        if (currentRaw && !same(currentRaw, current) && same(current, incoming)) counts.orderingOnlyDifference++
        if (currentRaw && Object.values(currentRaw.prices).some(value => value == null) && Object.values(incoming.prices).some(value => value === 0)) counts.nullZeroRepresentationDifference++
      }
      if (!current || !same(current.warehouseQuantities, incoming.warehouseQuantities)) counts.fullSnapshotMismatches++
      hypothetical[product.externalId] = incoming
    }
    let afterHypotheticalApply = 0
    for (const item of feed) {
      const product = productById.get(item.externalId); if (!product || product.isDeleted) continue
      if (!same(canonicalExtra(hypothetical[item.externalId]), canonicalExtra({ prices: item.prices!, warehouseQuantities: item.warehouseQuantities ?? {} }))) afterHypotheticalApply++
    }
    const special = products.find(product => product.id === '13324')
    const [after, recentSyncRuns] = await Promise.all([snapshot(prisma), prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 2 })])
    console.log(JSON.stringify({ before, after, recentSyncRuns, databaseWrites: 0, xml: { records: feed.length, uniqueSku: new Set(feed.map(item => item.externalId)).size, sha256: xmlSha256 }, scope: { exactLinked: feed.filter(item => productById.has(item.externalId)).length, unlinkedXml: feed.filter(item => !productById.has(item.externalId)).length, unlinkedLocal: products.filter(p => !p.externalId).length, softDeletedLinked: products.filter(p => p.isDeleted && p.externalId && feedById.has(p.externalId)).length }, counts, price3Samples, hypothetical: { erpUpdatesAfterApply: afterHypotheticalApply, canonicalization: 'numeric Number values; price keys fixed; warehouse keys lexically sorted; missing quantities represented by parser snapshot; JSON object ordering ignored' }, specialProduct13324: special ? { ...special, xml97388150Exists: feedById.has('97388150'), exactLinkedTo97388150: special.externalId === '97388150' } : null }, null, 2))
    if (!same(before, after) || afterHypotheticalApply) process.exitCode = 2
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(String(error)); process.exitCode = 1 })
