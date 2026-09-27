import type { ErpProduct } from './erp-adapter'
import type { ErpExtraData } from './erp-extra-data-store'
import { EXCLUDED_STOCK_WAREHOUSE_IDS, HAIRSHOP_STOCK_WAREHOUSE_IDS, getSyncRules, selectedStock, type SyncRules } from './sync-rules'

const SAMPLE_LIMIT = 10
const STOCK_SAMPLE_LIMIT = 20
export interface DryRunDbProduct { id: string; externalId: string | null; sku: string | null; price: unknown; stock: number; isActive: boolean }
type ChangeSample = { id: string; externalId: string; before: unknown; after: unknown }
type PriceExample = { sku: string; currentPrice: number; price1: number; price2: number; price3: number; price4: number; resultingProductPrice: number; decision: 'PRICE_UPDATED' | 'PRICE_UNCHANGED' | 'PRICE_TIER_ZERO_SKIPPED' }
type StockExample = { sku: string; currentStock: number; warehouse10000: number; warehouse10001: number; warehouse10002: number; warehouse10005: number; excludedWarehousesTotal: number; calculatedStock: number; syncSelectedStock: number; correct: boolean }

export interface SyncDryRunReport {
  matched: number; updates: number; unchanged: number; new: number; missing: number; wouldDeactivate: number; conflicts: number; duplicateExternalIds: string[]
  changes: { price: { count: number; samples: ChangeSample[] }; stock: { count: number; samples: ChangeSample[] }; sku: { count: number; samples: ChangeSample[] }; warehouseStock: { count: number; samples: ChangeSample[] } }
  priceAnalysis: { primaryTier: string; enabledTiers: string[]; priceWouldChange: number; priceUnchanged: number; PRICE_TIER_ZERO_SKIPPED: number; priceWouldBecomeZero: number; examples: PriceExample[] }
  stockAnalysis: { includedWarehouses: readonly string[]; excludedWarehouses: readonly string[]; stockWouldChange: number; stockUnchanged: number; positiveToZero: number; zeroToPositive: number; calculatedStockZero: number; stockFormulaMismatches: number; examples: StockExample[]; largestStocks: StockExample[]; largestChanges: StockExample[]; positiveToZeroClassification: { zeroEverywhere: number; excludedOnly: number; oldPlaceholder10000: number; suspicious: number } }
  newProductAnalysis: { total: number; priceAboveZero: number; priceZero: number; allowedStockAboveZero: number; allowedStockZero: number; priceAndStockAboveZero: number }
  newProducts: Array<{ sku: string; externalId: string; isActive: false }>; missingProducts: Array<{ id: string; sku: string | null; externalId: string; isActive: boolean }>; protectedFields: string[]
}

const numberOf = (value: unknown): number => Number(String(value))
const sameWarehouses = (a?: Record<string, number>, b?: Record<string, number>): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
const quantity = (p: ErpProduct, id: string): number => Math.max(0, p.warehouseQuantities?.[id] ?? 0)
const excludedTotal = (p: ErpProduct): number => EXCLUDED_STOCK_WAREHOUSE_IDS.reduce((sum, id) => sum + quantity(p, id), 0)

export function buildSyncDryRunReport(feedProducts: ErpProduct[], dbProducts: DryRunDbProduct[], currentExtraData: Record<string, ErpExtraData>, rules: SyncRules = getSyncRules()): SyncDryRunReport {
  const feedCounts = new Map<string, number>(); for (const p of feedProducts) feedCounts.set(p.externalId, (feedCounts.get(p.externalId) ?? 0) + 1)
  const duplicateExternalIds = [...feedCounts].filter(([, count]) => count > 1).map(([id]) => id).sort(); const duplicateSet = new Set(duplicateExternalIds)
  const feedById = new Map(feedProducts.filter(p => p.externalId && !duplicateSet.has(p.externalId)).map(p => [p.externalId, p]))
  const dbCounts = new Map<string, number>(); for (const p of dbProducts) if (p.externalId) dbCounts.set(p.externalId, (dbCounts.get(p.externalId) ?? 0) + 1)
  const dbConflicts = new Set([...dbCounts].filter(([, count]) => count > 1).map(([id]) => id))
  const samples = { price: [] as ChangeSample[], stock: [] as ChangeSample[], sku: [] as ChangeSample[], warehouseStock: [] as ChangeSample[] }; const counts = { price: 0, stock: 0, sku: 0, warehouseStock: 0 }
  const priceExamples: PriceExample[] = []; const stockExamples: StockExample[] = []
  let matched = 0, updates = 0, unchanged = 0, priceUnchanged = 0, zeroSkipped = 0, stockUnchanged = 0, positiveToZero = 0, zeroToPositive = 0, stockFormulaMismatches = 0
  for (const db of dbProducts) {
    if (!db.externalId || dbConflicts.has(db.externalId)) continue; const feed = feedById.get(db.externalId); if (!feed) continue; matched++; let changed = false
    const record = (field: keyof typeof counts, before: unknown, after: unknown) => { counts[field]++; changed = true; if (samples[field].length < SAMPLE_LIMIT) samples[field].push({ id: db.id, externalId: db.externalId!, before, after }) }
    const currentPrice = numberOf(db.price), selectedPrice = feed.price, resultPrice = selectedPrice > 0 ? selectedPrice : currentPrice
    const decision: PriceExample['decision'] = selectedPrice <= 0 ? 'PRICE_TIER_ZERO_SKIPPED' : resultPrice === currentPrice ? 'PRICE_UNCHANGED' : 'PRICE_UPDATED'
    if (selectedPrice <= 0) zeroSkipped++; if (resultPrice !== currentPrice) record('price', currentPrice, resultPrice); else priceUnchanged++
    { const prices = feed.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }; priceExamples.push({ sku: feed.sku ?? feed.externalId, currentPrice, ...prices, resultingProductPrice: resultPrice, decision }) }
    const calculatedStock = selectedStock(feed.warehouseQuantities ?? {}); if (feed.stock !== calculatedStock) stockFormulaMismatches++
    if (db.stock !== feed.stock) record('stock', db.stock, feed.stock); else stockUnchanged++; if (db.stock > 0 && feed.stock === 0) positiveToZero++; if (db.stock === 0 && feed.stock > 0) zeroToPositive++
    if (db.sku !== (feed.sku ?? null)) record('sku', db.sku, feed.sku ?? null)
    if (!sameWarehouses(currentExtraData[db.externalId]?.warehouseQuantities, feed.warehouseQuantities)) record('warehouseStock', currentExtraData[db.externalId]?.warehouseQuantities ?? {}, feed.warehouseQuantities ?? {})
    stockExamples.push({ sku: feed.sku ?? feed.externalId, currentStock: db.stock, warehouse10000: quantity(feed, '10000'), warehouse10001: quantity(feed, '10001'), warehouse10002: quantity(feed, '10002'), warehouse10005: quantity(feed, '10005'), excludedWarehousesTotal: excludedTotal(feed), calculatedStock, syncSelectedStock: feed.stock, correct: calculatedStock === feed.stock })
    if (changed) updates++; else unchanged++
  }
  const dbIds = new Set(dbProducts.map(p => p.externalId).filter((id): id is string => Boolean(id))); const allNew = feedProducts.filter(p => p.externalId && !duplicateSet.has(p.externalId) && !dbIds.has(p.externalId)); const missing = dbProducts.filter(p => p.externalId && !feedById.has(p.externalId)); const pz = stockExamples.filter(r => r.currentStock > 0 && r.syncSelectedStock === 0)
  return {
    matched, updates, unchanged, new: allNew.length, missing: missing.length, wouldDeactivate: missing.filter(p => p.isActive).length, conflicts: duplicateExternalIds.length + dbConflicts.size, duplicateExternalIds: [...new Set([...duplicateExternalIds, ...dbConflicts])].sort(),
    changes: { price: { count: counts.price, samples: samples.price }, stock: { count: counts.stock, samples: samples.stock }, sku: { count: counts.sku, samples: samples.sku }, warehouseStock: { count: counts.warehouseStock, samples: samples.warehouseStock } },
    priceAnalysis: { primaryTier: rules.primaryPriceTier, enabledTiers: [...rules.enabledPriceTiers], priceWouldChange: counts.price, priceUnchanged, PRICE_TIER_ZERO_SKIPPED: zeroSkipped, priceWouldBecomeZero: 0, examples: [...priceExamples].sort((a, b) => Number(b.decision === 'PRICE_TIER_ZERO_SKIPPED') - Number(a.decision === 'PRICE_TIER_ZERO_SKIPPED')).slice(0, SAMPLE_LIMIT) },
    stockAnalysis: { includedWarehouses: HAIRSHOP_STOCK_WAREHOUSE_IDS, excludedWarehouses: EXCLUDED_STOCK_WAREHOUSE_IDS, stockWouldChange: counts.stock, stockUnchanged, positiveToZero, zeroToPositive, calculatedStockZero: stockExamples.filter(r => r.calculatedStock === 0).length, stockFormulaMismatches, examples: stockExamples.slice(0, STOCK_SAMPLE_LIMIT), largestStocks: [...stockExamples].sort((a,b) => b.calculatedStock-a.calculatedStock).slice(0, STOCK_SAMPLE_LIMIT), largestChanges: [...stockExamples].sort((a,b) => Math.abs(b.syncSelectedStock-b.currentStock)-Math.abs(a.syncSelectedStock-a.currentStock)).slice(0, STOCK_SAMPLE_LIMIT), positiveToZeroClassification: { zeroEverywhere: pz.filter(r => r.excludedWarehousesTotal === 0).length, excludedOnly: pz.filter(r => r.excludedWarehousesTotal > 0).length, oldPlaceholder10000: pz.filter(r => r.currentStock === 10000).length, suspicious: pz.filter(r => r.excludedWarehousesTotal === 0 && r.currentStock !== 10000).length } },
    newProductAnalysis: { total: allNew.length, priceAboveZero: allNew.filter(p => p.price > 0).length, priceZero: allNew.filter(p => p.price <= 0).length, allowedStockAboveZero: allNew.filter(p => p.stock > 0).length, allowedStockZero: allNew.filter(p => p.stock === 0).length, priceAndStockAboveZero: allNew.filter(p => p.price > 0 && p.stock > 0).length },
    newProducts: allNew.slice(0, SAMPLE_LIMIT).map(p => ({ sku: p.sku ?? p.externalId, externalId: p.externalId, isActive: false as const })), missingProducts: missing.slice(0, SAMPLE_LIMIT).map(p => ({ id: p.id, sku: p.sku, externalId: p.externalId!, isActive: p.isActive })), protectedFields: ['title', 'description', 'images', 'category', 'isActive(existing)', 'manual characteristics', 'marketing settings', 'local administrative fields'],
  }
}
