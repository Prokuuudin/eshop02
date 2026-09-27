import { createHash, randomUUID } from 'crypto'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../prisma'
import type { ErpProduct } from './erp-adapter'
import { getErpExtraData, mergeEnabledPriceTiers, type ErpExtraData } from './erp-extra-data-store'
import { getSyncRules, selectedStock } from './sync-rules'
import type { Prisma } from '@/generated/prisma/client'

export const FIRST_WAVE_SIZE = 3393
export const EXPECTED_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const EXPECTED_ALLOWLIST_SHA256 = 'a8995cc87ec8e845aec09e6661640c185ae065d16a4ab12d91a3d1c171590176'
const EXTRA_DATA_KEY = 'erp-extra-data'

export interface AllowlistEntry { productId: string; productSku: string; xmlSku: string; externalIdToSet: string }
export interface FirstWaveAllowlist { xmlSha256: string; entries: AllowlistEntry[] }
export interface ScopeProduct { id: string; externalId: string | null; sku: string | null; price: unknown; stock: number; isActive: boolean; isDeleted: boolean }
export interface ControlledPlan {
  rows: Array<{ id: string; externalId: string; price: number; stock: number; originalPrice: number; originalStock: number; isActive: boolean }>
  extraData: Record<string, ErpExtraData>
  metrics: { inputXml: number; writeScope: number; newIgnored: number; priceWouldChange: number; priceUnchanged: number; priceTierZeroSkipped: number; priceWouldBecomeZero: number; stockWouldChange: number; stockUnchanged: number; resultingStockZero: number; stockFormulaMismatches: number; conflicts: number }
}

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

export function parseAndValidateAllowlist(content: string, xmlSha: string): FirstWaveAllowlist {
  if (sha256(content) !== EXPECTED_ALLOWLIST_SHA256) throw new Error('ALLOWLIST_SHA_MISMATCH')
  const parsed = JSON.parse(content) as FirstWaveAllowlist
  if (parsed.xmlSha256 !== EXPECTED_XML_SHA256 || xmlSha !== EXPECTED_XML_SHA256) throw new Error('XML_SHA_MISMATCH')
  if (parsed.entries.length !== FIRST_WAVE_SIZE) throw new Error(`SCOPE_SIZE_MISMATCH:${parsed.entries.length}`)
  const ids = new Set(parsed.entries.map(row => row.productId)); const externalIds = new Set(parsed.entries.map(row => row.externalIdToSet))
  if (ids.size !== FIRST_WAVE_SIZE || externalIds.size !== FIRST_WAVE_SIZE) throw new Error('ALLOWLIST_DUPLICATE_SCOPE')
  for (const row of parsed.entries) if (row.productSku !== row.xmlSku || row.externalIdToSet !== row.xmlSku) throw new Error(`ALLOWLIST_SKU_MISMATCH:${row.productId}`)
  return parsed
}

export function buildControlledPlan(allowlist: FirstWaveAllowlist, feed: ErpProduct[], dbProducts: ScopeProduct[], currentExtra: Record<string, ErpExtraData>): ControlledPlan {
  if (dbProducts.length !== FIRST_WAVE_SIZE) throw new Error(`DATABASE_SCOPE_SIZE_MISMATCH:${dbProducts.length}`)
  const feedCounts = new Map<string, number>(); for (const item of feed) feedCounts.set(item.externalId, (feedCounts.get(item.externalId) ?? 0) + 1)
  const feedById = new Map(feed.map(item => [item.externalId, item])); const dbById = new Map(dbProducts.map(item => [item.id, item])); const rules = getSyncRules()
  const rows: ControlledPlan['rows'] = []; const extraData: Record<string, ErpExtraData> = { ...currentExtra }
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
    rows.push({ id: db.id, externalId: allowed.externalIdToSet, price: nextPrice, stock: item.stock, originalPrice: oldPrice, originalStock: db.stock, isActive: db.isActive })
    extraData[item.externalId] = mergeEnabledPriceTiers(currentExtra[item.externalId], { prices: item.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }, warehouseQuantities: item.warehouseQuantities ?? {} }, rules.enabledPriceTiers)
  }
  if (conflicts) throw new Error(`FEED_CONFLICTS:${conflicts}`); if (stockFormulaMismatches) throw new Error(`STOCK_FORMULA_MISMATCHES:${stockFormulaMismatches}`); if (rows.length !== FIRST_WAVE_SIZE) throw new Error(`WRITE_SCOPE_MISMATCH:${rows.length}`)
  return { rows, extraData, metrics: { inputXml: feed.length, writeScope: rows.length, newIgnored: feed.length - rows.length, priceWouldChange, priceUnchanged, priceTierZeroSkipped, priceWouldBecomeZero: rows.filter(row => row.originalPrice > 0 && row.price === 0).length, stockWouldChange, stockUnchanged, resultingStockZero, stockFormulaMismatches, conflicts } }
}

async function loadScope(db: ExtendedPrismaClient | ExtendedTransactionClient, allowlist: FirstWaveAllowlist): Promise<ScopeProduct[]> {
  return db.product.findMany({ where: { id: { in: allowlist.entries.map(row => row.productId) } }, select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true } }) as unknown as ScopeProduct[]
}

export async function prepareControlledPlan(db: ExtendedPrismaClient, allowlist: FirstWaveAllowlist, feed: ErpProduct[]): Promise<ControlledPlan> {
  const [scope, extra] = await Promise.all([loadScope(db, allowlist), getErpExtraData(db)])
  return buildControlledPlan(allowlist, feed, scope, extra)
}

function updateSql(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, index) => { const base = index * 4; return `($${base + 1},$${base + 2},$${base + 3}::numeric,$${base + 4}::int)` }).join(',')
  return `UPDATE "Product" AS p SET price=v.price, stock=v.stock, "lastSyncRunId"=$${rowCount * 4 + 1}, "updatedAt"=now() FROM (VALUES ${values}) AS v(id,"externalId",price,stock) WHERE p.id=v.id AND p."externalId"=v."externalId" AND p."isDeleted"=false`
}

export async function executeControlledSync(db: ExtendedPrismaClient, allowlist: FirstWaveAllowlist, feed: ErpProduct[], xmlSha: string, allowlistSha: string): Promise<{ runId: string; updated: number; metrics: ControlledPlan['metrics']; durationMs: number; inserted: 0; deactivated: 0; rollback: false }> {
  const startedAt = new Date(); const runId = randomUUID()
  const result = await db.$transaction(async tx => {
    const scope = await loadScope(tx, allowlist)
    const row = await tx.keyValueSetting.findUnique({ where: { key: EXTRA_DATA_KEY } }); const currentExtra = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value as unknown as Record<string, ErpExtraData> : {}
    const plan = buildControlledPlan(allowlist, feed, scope, currentExtra)
    const params = plan.rows.flatMap(item => [item.id, item.externalId, item.price, item.stock]); params.push(runId)
    const updated = await tx.$executeRawUnsafe(updateSql(plan.rows.length), ...params)
    if (updated !== FIRST_WAVE_SIZE) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${updated}`)
    await tx.keyValueSetting.upsert({ where: { key: EXTRA_DATA_KEY }, create: { key: EXTRA_DATA_KEY, value: plan.extraData as unknown as Prisma.InputJsonValue }, update: { value: plan.extraData as unknown as Prisma.InputJsonValue } })
    await tx.syncRun.create({ data: { id: runId, status: 'completed', triggeredBy: `controlled-first-wave:${xmlSha.slice(0, 12)}:${allowlistSha.slice(0, 12)}`, startedAt, finishedAt: new Date(), productsTotal: FIRST_WAVE_SIZE, productsSynced: updated, deactivated: 0, errorCount: 0 } })
    return { runId, updated, metrics: plan.metrics }
  }, { isolationLevel: 'Serializable', timeout: 120_000, maxWait: 10_000 })
  return { ...result, durationMs: Date.now() - startedAt.getTime(), inserted: 0, deactivated: 0, rollback: false }
}
