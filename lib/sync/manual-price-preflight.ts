import type { ExtendedPrismaClient } from '@/lib/prisma'
import { auditManualXml, manualDecimal } from './manual-import-validation'
import { parseGrinsXml, readGrinsXmlItems } from './grins-xml-parser'
import { loadPreflightState, PREFLIGHT_THRESHOLDS as T, structuralFailures, toCents, type PreflightMetrics } from './sync-preflight'
import type { FeedEvaluation } from './manual-import'
import { hasValidB2BPrice } from '@/lib/product-sellability'

export async function priceCatalogFingerprint(db: ExtendedPrismaClient): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ fingerprint: string }>>(
    `SELECT encode(sha256(convert_to(COALESCE(string_agg(row_to_json(p)::text,',' ORDER BY p.id),''),'UTF8')),'hex') AS fingerprint
      FROM (SELECT id,"externalId",price,"erpPriceMissing","manualPriceApproved","manualApprovedPrice",revision,"isActive","isDeleted"
        FROM "Product" WHERE "externalId" IS NOT NULL) p`,
  )
  return rows[0].fingerprint
}

/** Price gates only. XML stock remains structurally validated but contributes
 * no update, availability decision, business gate, warning or change sample. */
export async function evaluatePriceFeed(db: ExtendedPrismaClient, xml: string): Promise<FeedEvaluation> {
  const catalogFingerprint = await priceCatalogFingerprint(db)
  const audit = auditManualXml(xml)
  const raw = audit.validXml ? readGrinsXmlItems(xml) : []
  const products = audit.validXml && !audit.invalidPrices.length && !audit.invalidStocks.length
    ? parseGrinsXml(xml, { primaryPriceTier: 'price2', enabledPriceTiers: new Set(['price2']) }).map((product, index) => ({ ...product, price: manualDecimal(raw[index].price2)! })) : []
  const state = await loadPreflightState(db)
  const hard = structuralFailures(audit)
  const warnings: string[] = []
  const groups = new Map<string, typeof state.linkedProducts>()
  for (const row of state.linkedProducts) groups.set(row.externalId, [...(groups.get(row.externalId) ?? []), row])
  const conflicts = [...groups.values()].filter(rows => rows.length > 1).length
  if (conflicts) hard.push(`${conflicts} conflicting externalId claimants`)
  const metrics: PreflightMetrics = {
    rows: products.length, previousProductsTotal: state.previousProductsTotal,
    linked: 0, unlinked: 0, softDeletedSkipped: 0, linkedRatio: 0, linkedMissingFromXml: 0,
    dbLinkedStockSum: 0, incomingLinkedStockSum: 0, activeInStock: 0, activeZeroed: 0, linkedStockZero: 0, linkedStockZeroRatio: 0,
    priceZero: 0, priceZeroRatio: 0, priceChanged: 0, priceChangedRatio: 0, largePriceChanges: 0, priceAboveWarnLimit: 0,
    includedWarehouseNonZeroRows: {},
  }
  const priceChanges: FeedEvaluation['samples']['priceChanges'] = []
  const xmlIds = new Set(products.map(product => product.externalId))
  const unlinked: string[] = []
  for (const product of products) {
    const cents = toCents(product.price)
    if (!cents) metrics.priceZero++
    if (cents > T.maxPriceWarnCents) metrics.priceAboveWarnLimit++
    const current = groups.get(product.externalId)?.[0]
    if (!current) { metrics.unlinked++; unlinked.push(product.externalId); continue }
    if (current.isDeleted) { metrics.softDeletedSkipped++; continue }
    metrics.linked++
    if (product.price > 0 && hasValidB2BPrice(current) !== hasValidB2BPrice({ ...current, price: product.price }) && !hard.includes('price_change_would_alter_sellability')) {
      hard.push('price_change_would_alter_sellability')
    }
    const before = toCents(current.price)
    if (cents > 0 && cents !== before) {
      metrics.priceChanged++
      if (before > 0 && Math.abs(cents - before) * 2 > before) metrics.largePriceChanges++
      if (priceChanges.length < 10) priceChanges.push({ externalId: product.externalId, before: current.price, after: product.price.toFixed(2) })
    }
  }
  metrics.linkedMissingFromXml = state.linkedProducts.filter(row => !row.isDeleted && !xmlIds.has(row.externalId)).length
  metrics.linkedRatio = products.length ? metrics.linked / products.length : 0
  metrics.priceZeroRatio = products.length ? metrics.priceZero / products.length : 0
  metrics.priceChangedRatio = metrics.linked ? metrics.priceChanged / metrics.linked : 0
  if (!hard.length && products.length) {
    if (!state.previousProductsTotal) hard.push('no previous completed FULL SyncRun (manual/cron) to compare feed size against')
    else {
      if (products.length < state.previousProductsTotal * T.feedMinRatio || products.length > state.previousProductsTotal * T.feedMaxRatio) hard.push('feed shrank or grew outside baseline limits')
      if (Math.abs(products.length - state.previousProductsTotal) / state.previousProductsTotal > T.feedDriftWarnRatio) warnings.push('feed size drift exceeds warning threshold')
    }
    if (products.length < T.feedMinRows) hard.push(`feed has ${products.length} rows (< absolute minimum ${T.feedMinRows})`)
    if (metrics.linkedRatio < T.linkedRatioHard) hard.push('linked ratio below required minimum')
    else if (metrics.linkedRatio < T.linkedRatioWarn) warnings.push('linked ratio below warning threshold')
    if (metrics.priceZeroRatio > T.priceZeroHard) hard.push('price2=0 ratio exceeds limit')
    else if (metrics.priceZeroRatio > T.priceZeroWarn) warnings.push('price2=0 ratio exceeds warning threshold')
    if (metrics.priceChangedRatio > T.priceChangedHard) hard.push('changed price ratio exceeds limit')
    else if (metrics.priceChangedRatio > T.priceChangedWarn) warnings.push('changed price ratio exceeds warning threshold')
    if (metrics.largePriceChanges) warnings.push(`${metrics.largePriceChanges} prices change by more than 50%`)
    if (metrics.priceAboveWarnLimit) warnings.push(`${metrics.priceAboveWarnLimit} prices exceed ${T.maxPriceWarnCents / 100} EUR`)
    if (metrics.unlinked) warnings.push(`${metrics.unlinked} rows skipped: no existing externalId link; prices-only never creates products`)
    if (metrics.softDeletedSkipped) warnings.push(`${metrics.softDeletedSkipped} deleted products skipped`)
    if (metrics.linkedMissingFromXml) warnings.push(`${metrics.linkedMissingFromXml} linked products missing from XML: prices kept`)
  }
  if (catalogFingerprint !== await priceCatalogFingerprint(db)) hard.push('catalog_changed_during_preview')
  return {
    catalogFingerprint, audit, products, preflight: { hard, warnings, metrics },
    summary: { rows: audit.itemCount, matched: metrics.linked, unlinked: metrics.unlinked, softDeletedSkipped: metrics.softDeletedSkipped,
      priceChanges: metrics.priceChanged, largePriceChanges: metrics.largePriceChanges, priceZero: metrics.priceZero,
      stockChanges: 0, stockToZero: 0, duplicateSkus: audit.duplicateExternalIds.length, conflicts,
      invalidValues: audit.invalidPrices.length + audit.invalidStocks.length, negativeValues: audit.negativePrices.length + audit.negativeStocks.length,
      linkedMissingFromXml: metrics.linkedMissingFromXml, inserts: 0, deactivations: 0 },
    samples: { unlinked: unlinked.slice(0, 10), duplicates: audit.duplicateExternalIds.slice(0, 10),
      invalidValues: [...audit.invalidPrices, ...audit.invalidStocks].slice(0, 10), priceChanges, stockChanges: [] },
  }
}
