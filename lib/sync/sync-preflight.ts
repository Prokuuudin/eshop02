import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpProduct } from './erp-adapter'
import type { GrinsXmlAudit } from './grins-xml-parser'
import { HAIRSHOP_STOCK_WAREHOUSE_IDS } from './sync-rules'

// Fail-closed thresholds for the scheduled FULL sync. Baselines come from the
// proven production FULL sync of 2026-09-28 (16176 rows, 15754 linked, stock
// sum 48221, price2=0 5.84%). HARD blocks every Product write; WARNING is
// recorded but does not block. There is deliberately no bypass in v1.
export const PREFLIGHT_THRESHOLDS = {
  feedMinRatio: 0.9,
  feedMaxRatio: 1.2,
  feedMinRows: 14_000,
  feedDriftWarnRatio: 0.02,
  linkedRatioHard: 0.9,
  linkedRatioWarn: 0.96,
  stockSumDropHard: 0.3,
  stockSumGrowthHard: 3,
  stockSumChangeWarn: 0.1,
  activeZeroedHard: 0.25,
  activeZeroedWarn: 0.05,
  linkedStockZeroHard: 0.95,
  priceZeroHard: 0.15,
  priceZeroWarn: 0.08,
  priceChangedHard: 0.1,
  priceChangedWarn: 0.01,
  singlePriceChangeWarn: 0.5,
  maxPriceWarnCents: 200_000,
  unlinkedWarn: 600,
} as const

/** Structural XML failures. Shared by the dry-run report and the scheduled preflight. */
export function structuralFailures(audit: GrinsXmlAudit): string[] {
  const critical: string[] = []
  if (!audit.validXml) critical.push(`invalid XML: ${audit.validationError ?? 'unknown validation error'}`)
  if (audit.itemCount === 0) critical.push('XML contains no products')
  if (audit.emptySkus > 0) critical.push(`${audit.emptySkus} products have an empty SKU/externalId`)
  if (audit.duplicateExternalIds.length > 0) critical.push(`${audit.duplicateExternalIds.length} duplicate externalId/SKU groups`)
  if (audit.invalidPrices.length > 0) critical.push(`${audit.invalidPrices.length} invalid price values`)
  if (audit.invalidStocks.length > 0) critical.push(`${audit.invalidStocks.length} invalid stock values`)
  if (audit.missingWarehouseIndexes.length > 0) critical.push(`required warehouse indexes missing: ${audit.missingWarehouseIndexes.join(', ')}`)
  if (audit.unexpectedWarehouseIndexes.length > 0) critical.push(`unexpected warehouse indexes: ${audit.unexpectedWarehouseIndexes.join(', ')}`)
  return critical
}

/**
 * Converts a decimal price to integer cents without float equality. Strings
 * (Postgres numeric::text) are parsed digit-wise; numbers are first rendered
 * with fixed precision. Rounds half away from zero like numeric(12,2).
 */
export function toCents(value: string | number): number {
  const text = typeof value === 'number' ? value.toFixed(6) : value.trim()
  const match = /^(-?)(\d*)(?:\.(\d*))?$/u.exec(text)
  if (!match) throw new Error(`Invalid decimal price: ${text}`)
  const [, sign, whole, fraction = ''] = match
  const digits = (fraction + '000').slice(0, 3)
  let cents = Number(whole || '0') * 100 + Number(digits.slice(0, 2))
  if (Number(digits[2]) >= 5) cents += 1
  return sign ? -cents : cents
}

export interface LinkedProductState {
  externalId: string
  /** Decimal as text (price::text). */
  price: string
  stock: number
  isActive: boolean
  isDeleted: boolean
  erpPriceMissing: boolean
  manualPriceApproved: boolean
  manualApprovedPrice: string | null
}

export interface PreflightInput {
  audit: GrinsXmlAudit
  products: ErpProduct[]
  /** Every Product with a non-null externalId, read before any write. */
  linkedProducts: LinkedProductState[]
  /** productsTotal of the last completed FULL SyncRun (manual/cron), or null. */
  previousProductsTotal: number | null
}

export interface PreflightMetrics {
  rows: number
  previousProductsTotal: number | null
  linked: number
  unlinked: number
  softDeletedSkipped: number
  linkedRatio: number
  linkedMissingFromXml: number
  dbLinkedStockSum: number
  incomingLinkedStockSum: number
  activeInStock: number
  activeZeroed: number
  linkedStockZero: number
  linkedStockZeroRatio: number
  priceZero: number
  priceZeroRatio: number
  priceChanged: number
  priceChangedRatio: number
  largePriceChanges: number
  priceAboveWarnLimit: number
  includedWarehouseNonZeroRows: Record<string, number>
}

export interface PreflightResult {
  hard: string[]
  warnings: string[]
  metrics: PreflightMetrics
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

export function evaluatePreflight(input: PreflightInput): PreflightResult {
  const T = PREFLIGHT_THRESHOLDS
  const hard = structuralFailures(input.audit)
  const warnings: string[] = []
  const { products, previousProductsTotal } = input
  const rows = products.length

  const byExternalId = new Map<string, LinkedProductState>()
  for (const product of input.linkedProducts) byExternalId.set(product.externalId, product)

  let linked = 0, unlinked = 0, softDeletedSkipped = 0
  let dbLinkedStockSum = 0, incomingLinkedStockSum = 0
  let activeInStock = 0, activeZeroed = 0, linkedStockZero = 0
  let priceZero = 0, priceChanged = 0, largePriceChanges = 0, priceAboveWarnLimit = 0
  const includedWarehouseNonZeroRows: Record<string, number> = Object.fromEntries(HAIRSHOP_STOCK_WAREHOUSE_IDS.map(id => [id, 0]))
  const xmlIds = new Set<string>()

  for (const product of products) {
    xmlIds.add(product.externalId)
    for (const id of HAIRSHOP_STOCK_WAREHOUSE_IDS) {
      if ((product.warehouseQuantities?.[id] ?? 0) > 0) includedWarehouseNonZeroRows[id]++
    }
    const incomingCents = toCents(product.price)
    if (incomingCents <= 0) priceZero++
    if (incomingCents > T.maxPriceWarnCents) priceAboveWarnLimit++

    const current = byExternalId.get(product.externalId)
    if (!current) { unlinked++; continue }
    if (current.isDeleted) { softDeletedSkipped++; continue }
    linked++
    dbLinkedStockSum += current.stock
    incomingLinkedStockSum += product.stock
    if (product.stock === 0) linkedStockZero++
    if (current.isActive && current.stock > 0) {
      activeInStock++
      if (product.stock === 0) activeZeroed++
    }
    // price2=0 keeps the existing price (upsert CASE), so it is never a change.
    if (incomingCents > 0) {
      const currentCents = toCents(current.price)
      if (incomingCents !== currentCents) {
        priceChanged++
        if (currentCents > 0 && Math.abs(incomingCents - currentCents) * 2 > currentCents) largePriceChanges++
      }
    }
  }

  const linkedMissingFromXml = input.linkedProducts.filter(p => !p.isDeleted && !xmlIds.has(p.externalId)).length
  const metrics: PreflightMetrics = {
    rows,
    previousProductsTotal,
    linked,
    unlinked,
    softDeletedSkipped,
    linkedRatio: ratio(linked, rows),
    linkedMissingFromXml,
    dbLinkedStockSum,
    incomingLinkedStockSum,
    activeInStock,
    activeZeroed,
    linkedStockZero,
    linkedStockZeroRatio: ratio(linkedStockZero, linked),
    priceZero,
    priceZeroRatio: ratio(priceZero, rows),
    priceChanged,
    priceChangedRatio: ratio(priceChanged, linked),
    largePriceChanges,
    priceAboveWarnLimit,
    includedWarehouseNonZeroRows,
  }

  // Structural failures make every metric below meaningless; stop here.
  if (hard.length > 0 || rows === 0) return { hard, warnings, metrics }

  // A. Feed size
  if (previousProductsTotal === null || previousProductsTotal <= 0) {
    hard.push('no previous completed FULL SyncRun (manual/cron) to compare feed size against')
  } else {
    if (rows < previousProductsTotal * T.feedMinRatio) hard.push(`feed shrank to ${rows} rows (< ${T.feedMinRatio * 100}% of previous ${previousProductsTotal})`)
    if (rows > previousProductsTotal * T.feedMaxRatio) hard.push(`feed grew to ${rows} rows (> ${T.feedMaxRatio * 100}% of previous ${previousProductsTotal})`)
    const drift = Math.abs(rows - previousProductsTotal) / previousProductsTotal
    if (drift > T.feedDriftWarnRatio) warnings.push(`feed size drift ${pct(drift)} vs previous ${previousProductsTotal}`)
  }
  if (rows < T.feedMinRows) hard.push(`feed has ${rows} rows (< absolute minimum ${T.feedMinRows})`)

  // B. Linked ratio
  if (metrics.linkedRatio < T.linkedRatioHard) hard.push(`linked ratio ${pct(metrics.linkedRatio)} < ${pct(T.linkedRatioHard)}`)
  else if (metrics.linkedRatio < T.linkedRatioWarn) warnings.push(`linked ratio ${pct(metrics.linkedRatio)} < ${pct(T.linkedRatioWarn)}`)
  if (linkedMissingFromXml > 0) warnings.push(`${linkedMissingFromXml} linked Products are missing from XML (their stock will not be refreshed)`)
  if (unlinked > T.unlinkedWarn) warnings.push(`${unlinked} unlinked XML rows (> ${T.unlinkedWarn})`)
  if (softDeletedSkipped > 0) warnings.push(`${softDeletedSkipped} XML rows claim soft-deleted Products`)

  // C. Stock
  if (dbLinkedStockSum > 0) {
    if (incomingLinkedStockSum < dbLinkedStockSum * (1 - T.stockSumDropHard)) {
      hard.push(`linked stock sum drops ${dbLinkedStockSum} → ${incomingLinkedStockSum} (> ${pct(T.stockSumDropHard)})`)
    }
    if (incomingLinkedStockSum > dbLinkedStockSum * T.stockSumGrowthHard) {
      hard.push(`linked stock sum grows ${dbLinkedStockSum} → ${incomingLinkedStockSum} (> ${T.stockSumGrowthHard}x)`)
    }
    const change = Math.abs(incomingLinkedStockSum - dbLinkedStockSum) / dbLinkedStockSum
    if (change > T.stockSumChangeWarn) warnings.push(`linked stock sum changes ${pct(change)} (${dbLinkedStockSum} → ${incomingLinkedStockSum})`)
  } else if (incomingLinkedStockSum > 0) {
    warnings.push(`current linked stock sum is 0; incoming ${incomingLinkedStockSum}`)
  }
  const zeroedRatio = ratio(activeZeroed, activeInStock)
  if (zeroedRatio > T.activeZeroedHard) hard.push(`${activeZeroed}/${activeInStock} active in-stock Products would drop to stock 0 (${pct(zeroedRatio)})`)
  else if (zeroedRatio > T.activeZeroedWarn) warnings.push(`${activeZeroed}/${activeInStock} active in-stock Products drop to stock 0 (${pct(zeroedRatio)})`)
  if (metrics.linkedStockZeroRatio > T.linkedStockZeroHard) hard.push(`stock=0 for ${pct(metrics.linkedStockZeroRatio)} of linked rows (> ${pct(T.linkedStockZeroHard)})`)
  for (const [id, count] of Object.entries(includedWarehouseNonZeroRows)) {
    if (count === 0) hard.push(`included warehouse ${id} has no row with non-zero stock`)
  }

  // D. Price (price2=0 → keep existing price is enforced by upsertProducts, unchanged)
  if (metrics.priceZeroRatio > T.priceZeroHard) hard.push(`price2=0 for ${pct(metrics.priceZeroRatio)} of XML rows (> ${pct(T.priceZeroHard)})`)
  else if (metrics.priceZeroRatio > T.priceZeroWarn) warnings.push(`price2=0 for ${pct(metrics.priceZeroRatio)} of XML rows (> ${pct(T.priceZeroWarn)})`)
  if (metrics.priceChangedRatio > T.priceChangedHard) hard.push(`${priceChanged} linked prices change (${pct(metrics.priceChangedRatio)} > ${pct(T.priceChangedHard)})`)
  else if (metrics.priceChangedRatio > T.priceChangedWarn) warnings.push(`${priceChanged} linked prices change (${pct(metrics.priceChangedRatio)})`)
  if (largePriceChanges > 0) warnings.push(`${largePriceChanges} linked prices change by more than ${pct(T.singlePriceChangeWarn)}`)
  if (priceAboveWarnLimit > 0) warnings.push(`${priceAboveWarnLimit} XML prices exceed ${T.maxPriceWarnCents / 100} EUR`)

  return { hard, warnings, metrics }
}

/** Read-only DB state for the preflight. Never writes. */
export async function loadPreflightState(db: ExtendedPrismaClient): Promise<{
  linkedProducts: LinkedProductState[]
  previousProductsTotal: number | null
}> {
  const [linkedProducts, previous] = await Promise.all([
    db.$queryRawUnsafe<LinkedProductState[]>(
      `SELECT "externalId", price::text AS price, stock, "isActive", "isDeleted",
         "erpPriceMissing", "manualPriceApproved", "manualApprovedPrice"::text AS "manualApprovedPrice"
         FROM "Product" WHERE "externalId" IS NOT NULL`,
    ),
    db.syncRun.findFirst({
      where: { status: 'completed', triggeredBy: { in: ['manual', 'cron'] } },
      orderBy: { finishedAt: 'desc' },
      select: { productsTotal: true },
    }),
  ])
  return { linkedProducts, previousProductsTotal: previous?.productsTotal ?? null }
}
