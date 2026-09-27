import { createHash, randomUUID } from 'crypto'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../prisma'
import type { ErpProduct } from './erp-adapter'
import { getErpExtraData, mergeEnabledPriceTiers, type ErpExtraData } from './erp-extra-data-store'
import { getSyncRules, selectedStock } from './sync-rules'
import type { Prisma } from '@/generated/prisma/client'

export const SECOND_WAVE_SIZE = 30
export const SECOND_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const SECOND_WAVE_ALLOWLIST_SHA256 = 'e9e1671ed152334a6cd517392c9464ae858fc538165cc0a74984cc846de2ea23'
const EXTRA_DATA_KEY = 'erp-extra-data'

export interface SecondWaveEntry { productId: string; productSku: string; xmlSku: string; externalIdToSet: string }
export interface SecondWaveAllowlist { xmlSha256: string; entries: SecondWaveEntry[] }
export interface ScopeProduct { id: string; externalId: string | null; sku: string | null; price: unknown; stock: number; isActive: boolean; isDeleted: boolean }
export interface SecondWavePlan {
  rows: Array<{ id: string; externalId: string; price: number; stock: number; originalPrice: number; originalStock: number }>
  extraData: Record<string, ErpExtraData>
  metrics: { inputXml: number; writeScope: number; newIgnored: number; priceWouldChange: number; priceUnchanged: number; priceTierZeroSkipped: number; priceWouldBecomeZero: number; stockWouldChange: number; stockUnchanged: number; resultingStockZero: number; stockFormulaMismatches: number; conflicts: number }
}

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

export function parseSecondWaveAllowlist(content: string, xmlSha: string): SecondWaveAllowlist {
  if (sha256(content) !== SECOND_WAVE_ALLOWLIST_SHA256) throw new Error('ALLOWLIST_SHA_MISMATCH')
  const parsed = JSON.parse(content) as SecondWaveAllowlist
  if (parsed.xmlSha256 !== SECOND_WAVE_XML_SHA256 || xmlSha !== SECOND_WAVE_XML_SHA256) throw new Error('XML_SHA_MISMATCH')
  if (parsed.entries.length !== SECOND_WAVE_SIZE) throw new Error(`SCOPE_SIZE_MISMATCH:${parsed.entries.length}`)
  if (new Set(parsed.entries.map(x => x.productId)).size !== SECOND_WAVE_SIZE || new Set(parsed.entries.map(x => x.externalIdToSet)).size !== SECOND_WAVE_SIZE) throw new Error('ALLOWLIST_DUPLICATE_SCOPE')
  for (const row of parsed.entries) {
    if (row.xmlSku !== row.externalIdToSet || row.productSku.toLocaleLowerCase('en-US') !== row.xmlSku.toLocaleLowerCase('en-US') || row.productSku === row.xmlSku) throw new Error(`ALLOWLIST_CASE_ONLY_MISMATCH:${row.productId}`)
    if (row.productSku.toLocaleLowerCase('en-US') === 'k18' || row.productSku.toLocaleLowerCase('en-US') === 'k86') throw new Error(`EXPLICIT_CASE_REVIEW_BLOCKED:${row.productId}`)
  }
  return parsed
}

export function buildSecondWavePlan(allowlist: SecondWaveAllowlist, feed: ErpProduct[], dbProducts: ScopeProduct[], currentExtra: Record<string, ErpExtraData>): SecondWavePlan {
  if (dbProducts.length !== SECOND_WAVE_SIZE) throw new Error(`DATABASE_SCOPE_SIZE_MISMATCH:${dbProducts.length}`)
  const feedCounts = new Map<string, number>(); for (const item of feed) feedCounts.set(item.externalId, (feedCounts.get(item.externalId) ?? 0) + 1)
  const feedById = new Map(feed.map(item => [item.externalId, item])); const dbById = new Map(dbProducts.map(item => [item.id, item])); const rules = getSyncRules()
  const rows: SecondWavePlan['rows'] = []; const extraData = { ...currentExtra }
  let priceWouldChange = 0, priceUnchanged = 0, priceTierZeroSkipped = 0, stockWouldChange = 0, stockUnchanged = 0, resultingStockZero = 0, stockFormulaMismatches = 0, conflicts = 0
  for (const allowed of allowlist.entries) {
    const db = dbById.get(allowed.productId); const item = feedById.get(allowed.xmlSku)
    if (!db || !item) throw new Error(`SCOPE_MEMBER_MISSING:${allowed.productId}:${allowed.xmlSku}`)
    if (db.isDeleted || db.externalId !== allowed.externalIdToSet || db.sku !== allowed.productSku) throw new Error(`IMMUTABLE_SCOPE_MISMATCH:${allowed.productId}`)
    if (feedCounts.get(item.externalId) !== 1) { conflicts++; continue }
    const formulaStock = selectedStock(item.warehouseQuantities ?? {}); if (formulaStock !== item.stock) stockFormulaMismatches++
    const oldPrice = Number(db.price); const nextPrice = item.price > 0 ? item.price : oldPrice
    if (item.price <= 0) priceTierZeroSkipped++; if (nextPrice !== oldPrice) priceWouldChange++; else priceUnchanged++
    if (item.stock !== db.stock) stockWouldChange++; else stockUnchanged++; if (item.stock === 0) resultingStockZero++
    rows.push({ id: db.id, externalId: allowed.externalIdToSet, price: nextPrice, stock: item.stock, originalPrice: oldPrice, originalStock: db.stock })
    extraData[item.externalId] = mergeEnabledPriceTiers(currentExtra[item.externalId], { prices: item.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }, warehouseQuantities: item.warehouseQuantities ?? {} }, rules.enabledPriceTiers)
  }
  if (conflicts) throw new Error(`FEED_CONFLICTS:${conflicts}`); if (stockFormulaMismatches) throw new Error(`STOCK_FORMULA_MISMATCHES:${stockFormulaMismatches}`); if (rows.length !== SECOND_WAVE_SIZE) throw new Error(`WRITE_SCOPE_MISMATCH:${rows.length}`)
  return { rows, extraData, metrics: { inputXml: feed.length, writeScope: rows.length, newIgnored: feed.length - rows.length, priceWouldChange, priceUnchanged, priceTierZeroSkipped, priceWouldBecomeZero: rows.filter(x => x.originalPrice > 0 && x.price === 0).length, stockWouldChange, stockUnchanged, resultingStockZero, stockFormulaMismatches, conflicts } }
}

async function loadScope(db: ExtendedPrismaClient | ExtendedTransactionClient, allowlist: SecondWaveAllowlist): Promise<ScopeProduct[]> {
  return db.product.findMany({ where: { id: { in: allowlist.entries.map(x => x.productId) } }, select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true } }) as unknown as ScopeProduct[]
}

export async function prepareSecondWavePlan(db: ExtendedPrismaClient, allowlist: SecondWaveAllowlist, feed: ErpProduct[]): Promise<SecondWavePlan> {
  const [scope, extra] = await Promise.all([loadScope(db, allowlist), getErpExtraData(db)])
  return buildSecondWavePlan(allowlist, feed, scope, extra)
}

function updateSql(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3}::numeric,$${i * 4 + 4}::int)`).join(',')
  return `UPDATE "Product" AS p SET price=v.price, stock=v.stock, "lastSyncRunId"=$${rowCount * 4 + 1}, "updatedAt"=now() FROM (VALUES ${values}) AS v(id,"externalId",price,stock) WHERE p.id=v.id AND p."externalId"=v."externalId" AND p."isDeleted"=false`
}

export async function executeSecondWaveSync(db: ExtendedPrismaClient, allowlist: SecondWaveAllowlist, feed: ErpProduct[], xmlSha: string, allowlistSha: string): Promise<{ runId: string; updated: number; metrics: SecondWavePlan['metrics']; durationMs: number; inserted: 0; deactivated: 0; rollback: false }> {
  const startedAt = new Date(); const runId = randomUUID()
  const result = await db.$transaction(async tx => {
    const scope = await loadScope(tx, allowlist)
    const stored = await tx.keyValueSetting.findUnique({ where: { key: EXTRA_DATA_KEY } }); const currentExtra = stored?.value && typeof stored.value === 'object' && !Array.isArray(stored.value) ? stored.value as unknown as Record<string, ErpExtraData> : {}
    const plan = buildSecondWavePlan(allowlist, feed, scope, currentExtra)
    const params: unknown[] = plan.rows.flatMap(x => [x.id, x.externalId, x.price, x.stock]); params.push(runId)
    const updated = await tx.$executeRawUnsafe(updateSql(plan.rows.length), ...params)
    if (updated !== SECOND_WAVE_SIZE) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${updated}`)
    await tx.keyValueSetting.upsert({ where: { key: EXTRA_DATA_KEY }, create: { key: EXTRA_DATA_KEY, value: plan.extraData as unknown as Prisma.InputJsonValue }, update: { value: plan.extraData as unknown as Prisma.InputJsonValue } })
    await tx.syncRun.create({ data: { id: runId, status: 'completed', triggeredBy: `controlled-second-wave-case-only:${xmlSha.slice(0, 12)}:${allowlistSha.slice(0, 12)}`, startedAt, finishedAt: new Date(), productsTotal: SECOND_WAVE_SIZE, productsSynced: updated, deactivated: 0, errorCount: 0 } })
    return { runId, updated, metrics: plan.metrics }
  }, { isolationLevel: 'Serializable', timeout: 120_000, maxWait: 10_000 })
  return { ...result, durationMs: Date.now() - startedAt.getTime(), inserted: 0 as const, deactivated: 0 as const, rollback: false as const }
}
