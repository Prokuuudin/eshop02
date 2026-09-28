import type { ErpProduct } from './erp-adapter'
import type { ErpExtraData } from './erp-extra-data-store'
import { EXCLUDED_STOCK_WAREHOUSE_IDS, HAIRSHOP_STOCK_WAREHOUSE_IDS, getSyncRules, selectedStock, type SyncRules } from './sync-rules'

export interface DryRunDbProduct { id: string; externalId: string | null; sku: string | null; price: unknown; stock: number; isActive: boolean; isDeleted?: boolean }
type Sample = { id: string; externalId: string; before: unknown; after: unknown }

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildSyncDryRunReport(feedProducts: ErpProduct[], dbProducts: DryRunDbProduct[], currentExtraData: Record<string, ErpExtraData>, rules: SyncRules = getSyncRules()) {
  const feedCounts = new Map<string, number>()
  for (const product of feedProducts) feedCounts.set(product.externalId, (feedCounts.get(product.externalId) ?? 0) + 1)
  const dbCounts = new Map<string, number>()
  for (const product of dbProducts) if (product.externalId) dbCounts.set(product.externalId, (dbCounts.get(product.externalId) ?? 0) + 1)
  const conflicts = new Set([...feedCounts, ...dbCounts].filter(([, count]) => count > 1).map(([id]) => id))
  const dbByExternalId = new Map(dbProducts.filter(product => product.externalId && !conflicts.has(product.externalId)).map(product => [product.externalId!, product]))
  const samples = { price: [] as Sample[], stock: [] as Sample[], warehouseStock: [] as Sample[] }
  const priceExamples: unknown[] = []; const stockExamples: unknown[] = []
  let matched = 0, updates = 0, unchanged = 0, priceUpdates = 0, stockUpdates = 0, metadataUpdates = 0, pricePreserved = 0, softDeletedSkipped = 0
  let positiveToZero = 0, zeroToPositive = 0, calculatedStockZero = 0, stockFormulaMismatches = 0
  const unlinkedXml: string[] = []

  for (const feed of feedProducts) {
    if (!feed.externalId || conflicts.has(feed.externalId)) continue
    const db = dbByExternalId.get(feed.externalId)
    if (!db) { unlinkedXml.push(feed.externalId); continue }
    if (db.isDeleted) { softDeletedSkipped++; continue }
    matched++
    let productChanged = false
    const price = Number(String(db.price)); const resultingPrice = feed.price > 0 ? feed.price : price
    if (feed.price <= 0) pricePreserved++
    priceExamples.push({ sku: feed.sku ?? feed.externalId, currentPrice: price, ...(feed.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }), resultingProductPrice: resultingPrice, decision: feed.price <= 0 ? 'PRICE_TIER_ZERO_SKIPPED' : resultingPrice === price ? 'PRICE_UNCHANGED' : 'PRICE_UPDATED' })
    if (resultingPrice !== price) { priceUpdates++; productChanged = true; samples.price.push({ id: db.id, externalId: feed.externalId, before: price, after: resultingPrice }) }
    if (db.stock !== feed.stock) { stockUpdates++; productChanged = true; samples.stock.push({ id: db.id, externalId: feed.externalId, before: db.stock, after: feed.stock }) }
    if (db.stock > 0 && feed.stock === 0) positiveToZero++
    if (db.stock === 0 && feed.stock > 0) zeroToPositive++
    const calculated = selectedStock(feed.warehouseQuantities ?? {})
    if (calculated === 0) calculatedStockZero++
    if (calculated !== feed.stock) stockFormulaMismatches++
    const quantity = (id: string) => Math.max(0, feed.warehouseQuantities?.[id] ?? 0)
    stockExamples.push({ sku: feed.sku ?? feed.externalId, currentStock: db.stock, calculatedStock: calculated, syncSelectedStock: feed.stock, excludedWarehousesTotal: EXCLUDED_STOCK_WAREHOUSE_IDS.reduce((sum, id) => sum + quantity(id), 0), correct: calculated === feed.stock })
    const nextExtra = { prices: feed.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }, warehouseQuantities: feed.warehouseQuantities ?? {} }
    if (JSON.stringify(currentExtraData[feed.externalId]) !== JSON.stringify(nextExtra)) {
      metadataUpdates++
      samples.warehouseStock.push({ id: db.id, externalId: feed.externalId, before: currentExtraData[feed.externalId] ?? null, after: nextExtra })
    }
    if (productChanged) updates++; else unchanged++
  }

  const missing = dbProducts.filter(product => product.externalId && !feedCounts.has(product.externalId))
  return {
    xmlTotal: feedProducts.length, matched, exactLinkedScope: matched, updates, unchanged,
    new: 0, unlinkedXml: unlinkedXml.length, unlinkedXmlSample: unlinkedXml.slice(0, 10), softDeletedSkipped,
    missing: missing.length, wouldDeactivate: 0, conflicts: conflicts.size, duplicateExternalIds: [...conflicts].sort(),
    productInserts: 0, externalIdAssignments: 0, activations: 0, deactivations: 0, outsideScopeChanges: 0,
    erpSemanticUpdates: metadataUpdates,
    changes: { price: { count: priceUpdates, samples: samples.price.slice(0, 10) }, stock: { count: stockUpdates, samples: samples.stock.slice(0, 10) }, sku: { count: 0, samples: [] }, warehouseStock: { count: metadataUpdates, samples: samples.warehouseStock.slice(0, 10) } },
    priceAnalysis: { primaryTier: rules.primaryPriceTier, enabledTiers: [...rules.enabledPriceTiers], priceWouldChange: priceUpdates, priceUnchanged: matched - priceUpdates, PRICE_TIER_ZERO_SKIPPED: pricePreserved, priceWouldBecomeZero: 0, examples: priceExamples.slice(0, 10) },
    stockAnalysis: { includedWarehouses: HAIRSHOP_STOCK_WAREHOUSE_IDS, excludedWarehouses: EXCLUDED_STOCK_WAREHOUSE_IDS, stockWouldChange: stockUpdates, stockUnchanged: matched - stockUpdates, positiveToZero, zeroToPositive, calculatedStockZero, stockFormulaMismatches, examples: stockExamples.slice(0, 20), largestStocks: [], largestChanges: [], positiveToZeroClassification: { zeroEverywhere: 0, excludedOnly: 0, oldPlaceholder10000: 0, suspicious: positiveToZero } },
    newProductAnalysis: { total: 0, priceAboveZero: 0, priceZero: 0, allowedStockAboveZero: 0, allowedStockZero: 0, priceAndStockAboveZero: 0 },
    newProducts: [], missingProducts: missing.slice(0, 10).map(product => ({ id: product.id, sku: product.sku, externalId: product.externalId!, isActive: product.isActive })),
    protectedFields: ['externalId', 'sku', 'title', 'description', 'images', 'category', 'isActive', 'soft-deleted Product', 'local-only Product'],
  }
}
