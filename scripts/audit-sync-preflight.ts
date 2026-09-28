import { config } from 'dotenv'
config({ path: '.env.local' })

import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { XMLParser } from 'fast-xml-parser'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { EXCLUDED_STOCK_WAREHOUSE_IDS, HAIRSHOP_STOCK_WAREHOUSE_IDS } from '../lib/sync/sync-rules'

type State = { count: number; externalIdCount: number; syncRunCount: number; fingerprint: string }
type RawItem = { sku?: string; quantity?: string | number }
type CsvValue = string | number | boolean | null | undefined

const q = (value: CsvValue) => `"${String(value ?? '').replaceAll('"', '""')}"`
const csv = (rows: Record<string, CsvValue>[]) => {
  const headers = Object.keys(rows[0] ?? {})
  return [headers.map(q).join(','), ...rows.map(row => headers.map(key => q(row[key])).join(','))].join('\n') + '\n'
}
const pct = (current: number, proposed: number) => current === 0 ? null : ((proposed - current) / current) * 100
const tierDistances = (current: number, prices: Record<string, number>) => Object.entries(prices).sort((a, b) => Math.abs(a[1] - current) - Math.abs(b[1] - current))
const band = (deltaPct: number) => {
  const direction = deltaPct < 0 ? 'decrease' : 'increase'; const value = Math.abs(deltaPct)
  if (value < 5) return `${direction}_lt_5`; if (value <= 10) return `${direction}_5_10`; if (value <= 25) return `${direction}_10_25`; if (value <= 50) return `${direction}_25_50`; return `${direction}_gt_50`
}

async function main() {
  const { prisma } = await import('../lib/prisma')
  const state = async (): Promise<State> => (await prisma.$queryRawUnsafe<State[]>(`SELECT COUNT(*)::int AS count, COUNT(p."externalId")::int AS "externalIdCount", (SELECT COUNT(*)::int FROM "SyncRun") AS "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint FROM "Product" p`))[0]
  try {
    const before = await state()
    const xml = await readFile('export.xml', 'utf8')
    const xmlSha256 = createHash('sha256').update(xml).digest('hex')
    const feed = parseGrinsXml(xml)
    const raw = new XMLParser({ parseTagValue: false, isArray: (name) => name === 'item' }).parse(xml) as { root?: { item?: RawItem[] } }
    const rawQty = new Map((raw.root?.item ?? []).map(item => [String(item.sku ?? '').trim(), Number(item.quantity ?? 0)]))
    const products = await prisma.product.findMany({ where: { isDeleted: false, externalId: { not: null } }, select: { id: true, externalId: true, sku: true, title: true, isActive: true, stock: true, price: true, createdAt: true, updatedAt: true, lastSyncRunId: true } })
    const feedById = new Map(feed.map(item => [item.externalId, item]))
    const excluded = (item: (typeof feed)[number]) => EXCLUDED_STOCK_WAREHOUSE_IDS.reduce((sum, id) => sum + Math.max(0, item.warehouseQuantities?.[id] ?? 0), 0)
    const allowed = (item: (typeof feed)[number]) => HAIRSHOP_STOCK_WAREHOUSE_IDS.reduce((sum, id) => sum + Math.max(0, item.warehouseQuantities?.[id] ?? 0), 0)
    const suspiciousProducts = products.filter(product => { const item = feedById.get(product.externalId!); return item && product.stock > 0 && item.stock === 0 && product.stock !== 10000 && excluded(item) === 0 })
    const ids = suspiciousProducts.map(product => product.id)
    const stockLogs = ids.length ? await prisma.auditLog.findMany({ where: { entityType: 'product', entityId: { in: ids }, action: 'product.stock_changed' }, select: { entityId: true, at: true, before: true, after: true } }) : []
    const logsById = new Map<string, typeof stockLogs>(); for (const log of stockLogs) logsById.set(log.entityId, [...(logsById.get(log.entityId) ?? []), log])
    const syncRuns = await prisma.syncRun.findMany({ orderBy: { startedAt: 'asc' }, select: { id: true, startedAt: true, finishedAt: true, status: true, productsSynced: true, deactivated: true, triggeredBy: true } })

    const stockRows = suspiciousProducts.map(product => {
      const item = feedById.get(product.externalId!)!; const w = item.warehouseQuantities ?? {}; const logs = logsById.get(product.id) ?? []
      const origin = logs.length ? 'CONFIRMED_MANUAL_AUDIT_LOG' : product.lastSyncRunId ? 'CONFIRMED_PREVIOUS_SYNC' : /^\d+$/.test(product.id) ? 'LIKELY_LEGACY_MSSQL_IMPORT' : 'UNKNOWN_ORIGIN'
      return { productId: product.id, externalId: product.externalId, sku: product.sku, title: product.title, isActive: product.isActive, currentStock: product.stock,
        qty10000: w['10000'] ?? 0, qty10001: w['10001'] ?? 0, qty10002: w['10002'] ?? 0, qty10005: w['10005'] ?? 0, allowedStock: allowed(item),
        qty10003: w['10003'] ?? 0, qty10004: w['10004'] ?? 0, qty10006: w['10006'] ?? 0, qty10007: w['10007'] ?? 0, qty10010: w['10010'] ?? 0, excludedStock: excluded(item), xmlQuantity: rawQty.get(item.externalId) ?? null,
        currentPrice: Number(product.price), price2: item.prices?.price2 ?? item.price, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(), lastSyncRunId: product.lastSyncRunId,
        stockAuditLogCount: logs.length, stockOrigin: origin, classification: product.isActive ? 'ACTIVE_ZERO_IN_FRESH_GRINS' : 'INACTIVE_ZERO_IN_FRESH_GRINS' }
    })

    const priceRows = products.flatMap(product => { const item = feedById.get(product.externalId!); if (!item || item.price <= 0 || Number(product.price) === item.price) return []
      const current = Number(product.price), proposed = item.price, prices = item.prices ?? { price1: 0, price2: item.price, price3: 0, price4: 0 }, delta = proposed - current, deltaPct = pct(current, proposed)
      const distances = tierDistances(current, prices); const closest = distances[0]; const p1 = prices.price1; const p3 = prices.price3
      const outlierRatio = Math.min(...[p1, p3].filter(v => v > 0).map(v => Math.max(proposed, v) / Math.min(proposed, v)))
      const flags = [Math.abs(deltaPct ?? 0) > 50 && 'PERCENT_GT_50', Math.abs(delta) > 50 && 'ABS_DELTA_GT_50', current === p1 && current !== proposed && 'CURRENT_EQUALS_PRICE1', closest?.[0] !== 'price2' && Math.abs(closest?.[1] - current) + 0.01 < Math.abs(proposed - current) && `CLOSER_TO_${closest?.[0]?.toUpperCase()}`, outlierRatio >= 3 && 'PRICE2_TIER_OUTLIER', proposed >= 500 && 'UNUSUALLY_HIGH', proposed > 0 && proposed < 0.5 && 'VERY_SMALL_NONZERO', product.isActive && Math.abs(deltaPct ?? 0) > 50 && 'ACTIVE_LARGE_CHANGE'].filter(Boolean).join('|')
      return [{ productId: product.id, externalId: product.externalId, sku: product.sku, title: product.title, currentPrice: current, price1: prices.price1, price2: prices.price2, price3: prices.price3, price4: prices.price4, proposedPrice: proposed, absoluteDelta: delta, absoluteDeltaMagnitude: Math.abs(delta), percentageDelta: deltaPct, percentageBand: band(deltaPct ?? 0), isActive: product.isActive, currentStock: product.stock, allowedGrinsStock: allowed(item), price2MappingCorrect: proposed === prices.price2, closestTierToCurrent: closest?.[0], flags, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(), lastSyncRunId: product.lastSyncRunId }]
    })

    const bands: Record<string, number> = {}; for (const row of priceRows) bands[row.percentageBand] = (bands[row.percentageBand] ?? 0) + 1
    const top = (selector: (row: typeof priceRows[number]) => number, filter: (row: typeof priceRows[number]) => boolean) => priceRows.filter(filter).sort((a, b) => selector(b) - selector(a)).slice(0, 20)
    const summary = {
      generatedAt: new Date().toISOString(), xmlSha256, before, linkedProducts: products.length,
      stock: { uniqueSuspicious: stockRows.length, active: stockRows.filter(r => r.isActive).length, inactive: stockRows.filter(r => !r.isActive).length, origin: Object.fromEntries([...new Set(stockRows.map(r => r.stockOrigin))].map(key => [key, stockRows.filter(r => r.stockOrigin === key).length])), currentStockDistribution: Object.fromEntries([...new Set(stockRows.map(r => r.currentStock))].sort((a,b)=>a-b).map(key => [key, stockRows.filter(r => r.currentStock === key).length])), createdRange: [stockRows.map(r => r.createdAt).sort()[0], stockRows.map(r => r.createdAt).sort().at(-1)], updatedRange: [stockRows.map(r => r.updatedAt).sort()[0], stockRows.map(r => r.updatedAt).sort().at(-1)], withAuditLogs: stockRows.filter(r => r.stockAuditLogCount > 0).length },
      price: { changes: priceRows.length, increases: priceRows.filter(r => r.absoluteDelta > 0).length, decreases: priceRows.filter(r => r.absoluteDelta < 0).length, bands, price2MappingMismatches: priceRows.filter(r => !r.price2MappingCorrect).length, percentGt50: priceRows.filter(r => Math.abs(r.percentageDelta ?? 0) > 50).length, absoluteDeltaGt50: priceRows.filter(r => r.absoluteDeltaMagnitude > 50).length, currentEqualsPrice1: priceRows.filter(r => r.flags.includes('CURRENT_EQUALS_PRICE1')).length, closerToOtherTier: priceRows.filter(r => r.flags.includes('CLOSER_TO_')).length, tierOutliers: priceRows.filter(r => r.flags.includes('PRICE2_TIER_OUTLIER')).length, unusuallyHigh: priceRows.filter(r => r.flags.includes('UNUSUALLY_HIGH')).length, verySmall: priceRows.filter(r => r.flags.includes('VERY_SMALL_NONZERO')).length, activeLargeChange: priceRows.filter(r => r.flags.includes('ACTIVE_LARGE_CHANGE')).length,
        topAbsoluteDecreases: top(r => Math.abs(r.absoluteDelta), r => r.absoluteDelta < 0), topAbsoluteIncreases: top(r => r.absoluteDelta, r => r.absoluteDelta > 0), topPercentDecreases: top(r => Math.abs(r.percentageDelta ?? 0), r => r.absoluteDelta < 0), topPercentIncreases: top(r => r.percentageDelta ?? 0, r => r.absoluteDelta > 0) },
      syncRuns,
    }
    await writeFile('sync-preflight-stock-anomalies.csv', csv(stockRows), 'utf8')
    await writeFile('sync-preflight-price-anomalies.csv', csv(priceRows), 'utf8')
    await writeFile('sync-preflight-anomalies.json', JSON.stringify(summary, null, 2), 'utf8')
    const after = await state(); const databaseWrites = JSON.stringify(before) === JSON.stringify(after) ? 0 : 'DETECTED'
    const markdown = `# Sync preflight anomalies\n\nGenerated: ${summary.generatedAt}\n\n## Safety\n\n- Before: \`${JSON.stringify(before)}\`\n- After: \`${JSON.stringify(after)}\`\n- databaseWrites: **${databaseWrites}**\n\n## Stock\n\n- Unique suspicious: **${stockRows.length}**\n- Active: **${summary.stock.active}**\n- Inactive: **${summary.stock.inactive}**\n- Origin: \`${JSON.stringify(summary.stock.origin)}\`\n- Current stock distribution: \`${JSON.stringify(summary.stock.currentStockDistribution)}\`\n- Rows with stock AuditLog: **${summary.stock.withAuditLogs}**\n\n## Price\n\n- Changes: **${priceRows.length}**\n- Increases/decreases: **${summary.price.increases}/${summary.price.decreases}**\n- Bands: \`${JSON.stringify(bands)}\`\n- price2MappingMismatches: **${summary.price.price2MappingMismatches}**\n- >50%: **${summary.price.percentGt50}**\n- |delta| > EUR50: **${summary.price.absoluteDeltaGt50}**\n\nSee the two CSV files for filterable row-level data.\n`
    await writeFile('sync-preflight-anomalies.md', markdown, 'utf8')
    console.log(JSON.stringify({ ...summary, after, databaseWrites, reportFiles: ['sync-preflight-anomalies.md', 'sync-preflight-anomalies.json', 'sync-preflight-stock-anomalies.csv', 'sync-preflight-price-anomalies.csv'] }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
