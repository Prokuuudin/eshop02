import { randomUUID } from 'crypto'
import type { Prisma } from '@/generated/prisma/client'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../prisma'
import type { ErpProduct } from './erp-adapter'
import { getErpExtraData, mergeEnabledPriceTiers, type ErpExtraData } from './erp-extra-data-store'
import { getSyncRules, selectedStock } from './sync-rules'
import { THIRD_WAVE_ALLOWLIST_SHA256, THIRD_WAVE_SIZE, THIRD_WAVE_XML_SHA256, sha256, type ThirdWaveAllowlist } from './third-wave-backfill'

type ScopeProduct = { id: string; externalId: string | null; sku: string | null; price: unknown; stock: number; isDeleted: boolean }
export type ThirdWavePlan = {
  rows: Array<{ id: string; externalId: string; price: number; stock: number; originalPrice: number; originalStock: number }>
  extraData: Record<string, ErpExtraData>
  metrics: { inputXml: number; writeScope: number; newIgnored: number; priceWouldChange: number; priceUnchanged: number; priceTierZeroSkipped: number; priceWouldBecomeZero: number; stockWouldChange: number; stockUnchanged: number; resultingStockZero: number; stockFormulaMismatches: number; conflicts: number }
}

export function parseThirdWaveAllowlist(content: string, xmlSha: string): ThirdWaveAllowlist {
  if (sha256(content) !== THIRD_WAVE_ALLOWLIST_SHA256) throw new Error('ALLOWLIST_SHA_MISMATCH')
  if (xmlSha !== THIRD_WAVE_XML_SHA256) throw new Error('XML_SHA_MISMATCH')
  const parsed = JSON.parse(content) as ThirdWaveAllowlist
  if (parsed.xmlSha256 !== THIRD_WAVE_XML_SHA256 || parsed.entryCount !== THIRD_WAVE_SIZE || parsed.entries.length !== THIRD_WAVE_SIZE) throw new Error('SCOPE_SIZE_OR_SOURCE_MISMATCH')
  if (new Set(parsed.entries.map(x => x.productId)).size !== THIRD_WAVE_SIZE || new Set(parsed.entries.map(x => x.externalIdToSet)).size !== THIRD_WAVE_SIZE) throw new Error('ALLOWLIST_DUPLICATE_SCOPE')
  for (const x of parsed.entries) if (x.matchType !== 'DUPLICATE_SAFE' || x.productSku !== x.xmlSku || x.externalIdToSet !== x.xmlSku || !x.rejectedDuplicateProductIds.length) throw new Error(`ALLOWLIST_IDENTITY_MISMATCH:${x.productId}`)
  return parsed
}

async function loadScope(db: ExtendedPrismaClient | ExtendedTransactionClient, allowlist: ThirdWaveAllowlist): Promise<ScopeProduct[]> {
  return db.product.findMany({ where: { id: { in: allowlist.entries.map(x => x.productId) } }, select: { id: true, externalId: true, sku: true, price: true, stock: true, isDeleted: true } }) as unknown as ScopeProduct[]
}

export function buildThirdWavePlan(allowlist: ThirdWaveAllowlist, feed: ErpProduct[], products: ScopeProduct[], currentExtra: Record<string, ErpExtraData>): ThirdWavePlan {
  if (products.length !== THIRD_WAVE_SIZE) throw new Error(`DATABASE_SCOPE_SIZE_MISMATCH:${products.length}`)
  const counts = new Map<string, number>(); for (const item of feed) counts.set(item.externalId, (counts.get(item.externalId) ?? 0) + 1)
  const feedById = new Map(feed.map(x => [x.externalId, x])), dbById = new Map(products.map(x => [x.id, x])), rules = getSyncRules()
  const rows: ThirdWavePlan['rows'] = [], extraData = { ...currentExtra }
  let priceWouldChange = 0, priceUnchanged = 0, priceTierZeroSkipped = 0, stockWouldChange = 0, stockUnchanged = 0, resultingStockZero = 0, stockFormulaMismatches = 0, conflicts = 0
  for (const allowed of allowlist.entries) {
    const db = dbById.get(allowed.productId), item = feedById.get(allowed.xmlSku)
    if (!db || !item) throw new Error(`SCOPE_MEMBER_MISSING:${allowed.productId}`)
    if (db.isDeleted || db.externalId !== allowed.externalIdToSet || db.sku !== allowed.productSku) throw new Error(`IMMUTABLE_SCOPE_MISMATCH:${allowed.productId}`)
    if (counts.get(item.externalId) !== 1) { conflicts++; continue }
    if (selectedStock(item.warehouseQuantities ?? {}) !== item.stock) stockFormulaMismatches++
    const originalPrice = Number(db.price), price = item.price > 0 ? item.price : originalPrice
    if (item.price <= 0) priceTierZeroSkipped++; if (price === originalPrice) priceUnchanged++; else priceWouldChange++
    if (item.stock === db.stock) stockUnchanged++; else stockWouldChange++; if (item.stock === 0) resultingStockZero++
    rows.push({ id: db.id, externalId: allowed.externalIdToSet, price, stock: item.stock, originalPrice, originalStock: db.stock })
    extraData[item.externalId] = mergeEnabledPriceTiers(currentExtra[item.externalId], { prices: item.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 }, warehouseQuantities: item.warehouseQuantities ?? {} }, rules.enabledPriceTiers)
  }
  if (conflicts || stockFormulaMismatches || rows.length !== THIRD_WAVE_SIZE) throw new Error(`PLAN_GATE_FAILED:${conflicts}:${stockFormulaMismatches}:${rows.length}`)
  return { rows, extraData, metrics: { inputXml: feed.length, writeScope: rows.length, newIgnored: feed.length - rows.length, priceWouldChange, priceUnchanged, priceTierZeroSkipped, priceWouldBecomeZero: rows.filter(x => x.originalPrice > 0 && x.price === 0).length, stockWouldChange, stockUnchanged, resultingStockZero, stockFormulaMismatches, conflicts } }
}

export async function prepareThirdWavePlan(db: ExtendedPrismaClient, allowlist: ThirdWaveAllowlist, feed: ErpProduct[]) {
  const [scope, extra] = await Promise.all([loadScope(db, allowlist), getErpExtraData(db)])
  return buildThirdWavePlan(allowlist, feed, scope, extra)
}

function updateSql(n: number) {
  const values = Array.from({ length: n }, (_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3}::numeric,$${i * 4 + 4}::int)`).join(',')
  return `UPDATE "Product" p SET price=v.price,stock=v.stock,"lastSyncRunId"=$${n * 4 + 1},"updatedAt"=now() FROM (VALUES ${values}) v(id,"externalId",price,stock) WHERE p.id=v.id AND p."externalId"=v."externalId" AND p."isDeleted"=false`
}

export async function executeThirdWaveSync(db: ExtendedPrismaClient, allowlist: ThirdWaveAllowlist, feed: ErpProduct[], xmlSha: string, allowlistSha: string) {
  const startedAt = new Date(), runId = randomUUID()
  const result = await db.$transaction(async tx => {
    const scope = await loadScope(tx, allowlist), stored = await tx.keyValueSetting.findUnique({ where: { key: 'erp-extra-data' } })
    const current = stored?.value && typeof stored.value === 'object' && !Array.isArray(stored.value) ? stored.value as unknown as Record<string, ErpExtraData> : {}
    const plan = buildThirdWavePlan(allowlist, feed, scope, current), params: unknown[] = plan.rows.flatMap(x => [x.id, x.externalId, x.price, x.stock]); params.push(runId)
    const updated = await tx.$executeRawUnsafe(updateSql(plan.rows.length), ...params); if (updated !== THIRD_WAVE_SIZE) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${updated}`)
    await tx.keyValueSetting.upsert({ where: { key: 'erp-extra-data' }, create: { key: 'erp-extra-data', value: plan.extraData as unknown as Prisma.InputJsonValue }, update: { value: plan.extraData as unknown as Prisma.InputJsonValue } })
    await tx.syncRun.create({ data: { id: runId, status: 'completed', triggeredBy: `controlled-third-wave-duplicate-safe:${xmlSha}:${allowlistSha}`, startedAt, finishedAt: new Date(), productsTotal: THIRD_WAVE_SIZE, productsSynced: updated, deactivated: 0, errorCount: 0 } })
    return { runId, updated, metrics: plan.metrics }
  }, { isolationLevel: 'Serializable', timeout: 120_000, maxWait: 10_000 })
  return { ...result, durationMs: Date.now() - startedAt.getTime(), inserted: 0, deactivated: 0, rollback: false }
}
