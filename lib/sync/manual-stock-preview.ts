import type { ExtendedPrismaClient } from '@/lib/prisma'
import { auditGrinsXml, parseGrinsXml, readGrinsXmlItems, type GrinsXmlAudit } from './grins-xml-parser'
import { manualDecimal } from './manual-import-validation'

export interface ManualStockChange {
  /** Exact externalId/SKU from the GrinS export. */
  externalId: string
  /** Product.sku from the local catalog; null when it is not set. */
  localSku: string | null
  currentStock: number
  incomingStock: number
  delta: number
  /** Signed percentage; null when current stock is zero. */
  percentageChange: number | null
  /** Strictly more than 50% of a non-zero current stock. */
  largeDifference: boolean
  zeroTransition: 'to-zero' | 'from-zero' | null
}

export interface ManualStockPreviewSummary {
  rows: number
  matched: number
  skipped: number
  unlinked: number
  softDeletedSkipped: number
  unchanged: number
  stockChanges: number
  increases: number
  decreases: number
  zeroTransitions: number
  toZero: number
  fromZero: number
  largeDifferences: number
  duplicateSkus: number
  conflicts: number
  invalidValues: number
  negativeValues: number
}

export interface ManualStockPreviewEvaluation {
  hard: string[]
  warnings: string[]
  summary: ManualStockPreviewSummary
  changes: ManualStockChange[]
  samples: {
    unlinked: string[]
    softDeleted: string[]
    duplicates: string[]
    invalidValues: Array<{ sku: string; field: string; value: string }>
    negativeValues: Array<{ sku: string; field: string; value: number }>
  }
}

export function auditStockXml(xml: string): GrinsXmlAudit {
  const audit = auditGrinsXml(xml)
  if (!audit.validXml) return audit

  // Stock Preview deliberately ignores all price fields. Rebuild only the
  // strict integer stock validation required before calling the shared parser.
  audit.invalidPrices = []
  audit.negativePrices = []
  audit.invalidStocks = []
  audit.negativeStocks = []

  for (const item of readGrinsXmlItems(xml)) {
    const sku = String(item.sku ?? '').trim()
    const validateStock = (field: string, raw: unknown): number | null => {
      const text = String(raw ?? '').trim()
      const numeric = Number(text)
      if (text !== '' && Number.isFinite(numeric) && Number.isInteger(numeric) && numeric < 0) {
        audit.negativeStocks.push({ sku, field, value: numeric })
        return null
      }
      const value = manualDecimal(raw, true)
      if (value === null) audit.invalidStocks.push({ sku, field, value: String(raw ?? '') })
      return value
    }

    validateStock('quantity', item.quantity)
    const slots = new Set<string>()
    let selected = 0
    for (const warehouse of item.warehouses?.warehouse ?? []) {
      const slot = String(warehouse['@_id'] ?? '').trim()
      const value = validateStock(`warehouse:${slot}`, warehouse['#text'])
      if (!/^[1-9]$/u.test(slot) || slots.has(slot)) {
        audit.invalidStocks.push({ sku, field: `warehouse:${slot}`, value: String(warehouse['#text'] ?? '') })
      }
      slots.add(slot)
      if (['1', '2', '3', '6'].includes(slot)) selected += value ?? 0
    }
    for (let slot = 1; slot <= 9; slot++) {
      if (!slots.has(String(slot))) audit.invalidStocks.push({ sku, field: `warehouse:${slot}`, value: 'missing' })
    }
    if (selected > 2_147_483_647) {
      audit.invalidStocks.push({ sku, field: 'selectedStock', value: String(selected) })
    }
  }
  return audit
}

export function stockStructuralFailures(audit: GrinsXmlAudit): string[] {
  const hard: string[] = []
  if (!audit.validXml) hard.push(`invalid XML: ${audit.validationError ?? 'unknown validation error'}`)
  if (audit.itemCount === 0) hard.push('XML contains no products')
  if (audit.emptySkus > 0) hard.push(`${audit.emptySkus} products have an empty SKU/externalId`)
  if (audit.duplicateExternalIds.length > 0) hard.push(`${audit.duplicateExternalIds.length} duplicate externalId/SKU groups`)
  if (audit.invalidStocks.length > 0) hard.push(`${audit.invalidStocks.length} invalid stock values`)
  if (audit.negativeStocks.length > 0) hard.push(`${audit.negativeStocks.length} negative stock values`)
  if (audit.missingWarehouseIndexes.length > 0) hard.push(`required warehouse indexes missing: ${audit.missingWarehouseIndexes.join(', ')}`)
  if (audit.unexpectedWarehouseIndexes.length > 0) hard.push(`unexpected warehouse indexes: ${audit.unexpectedWarehouseIndexes.join(', ')}`)
  return hard
}

/**
 * Read-only stock diagnostic. It reads only Product identity/current stock and
 * never persists a pending preview, audit row, SyncRun or catalog mutation.
 */
export async function evaluateStockPreview(db: ExtendedPrismaClient, xml: string): Promise<ManualStockPreviewEvaluation> {
  const audit = auditStockXml(xml)
  const hard = stockStructuralFailures(audit)
  const rows = await db.product.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true, sku: true, stock: true, isDeleted: true },
  })

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    if (row.externalId === null) continue
    groups.set(row.externalId, [...(groups.get(row.externalId) ?? []), row])
  }
  const conflicts = [...groups.values()].filter(group => group.length > 1).length
  if (conflicts) hard.push(`${conflicts} conflicting externalId claimants`)

  const products = hard.length === 0
    ? parseGrinsXml(xml, { primaryPriceTier: 'price2', enabledPriceTiers: new Set(['price2']) })
    : []
  const changes: ManualStockChange[] = []
  const unlinked: string[] = []
  const softDeleted: string[] = []
  let matched = 0
  let unchanged = 0
  let increases = 0
  let decreases = 0
  let toZero = 0
  let fromZero = 0
  let largeDifferences = 0

  for (const product of products) {
    const current = groups.get(product.externalId)?.[0]
    if (!current) {
      unlinked.push(product.externalId)
      continue
    }
    if (current.isDeleted) {
      softDeleted.push(product.externalId)
      continue
    }
    matched++
    if (current.stock === product.stock) {
      unchanged++
      continue
    }

    const delta = product.stock - current.stock
    const percentageChange = current.stock > 0 ? (delta / current.stock) * 100 : null
    const largeDifference = current.stock > 0 && Math.abs(delta) * 2 > current.stock
    const zeroTransition = current.stock > 0 && product.stock === 0
      ? 'to-zero' as const
      : current.stock === 0 && product.stock > 0
        ? 'from-zero' as const
        : null
    if (delta > 0) increases++
    else decreases++
    if (zeroTransition === 'to-zero') toZero++
    if (zeroTransition === 'from-zero') fromZero++
    if (largeDifference) largeDifferences++
    changes.push({
      externalId: product.externalId,
      localSku: current.sku ?? null,
      currentStock: current.stock,
      incomingStock: product.stock,
      delta,
      percentageChange,
      largeDifference,
      zeroTransition,
    })
  }

  const skipped = unlinked.length + softDeleted.length
  const warnings: string[] = [
    'GrinS stock semantics are not confirmed; incoming values must not be treated as available-to-sell stock',
  ]
  if (unlinked.length) warnings.push(`${unlinked.length} rows skipped: no exact existing externalId match`)
  if (softDeleted.length) warnings.push(`${softDeleted.length} soft-deleted products skipped`)
  if (largeDifferences) warnings.push(`${largeDifferences} stock differences exceed 50%`)

  return {
    hard,
    warnings,
    summary: {
      rows: audit.itemCount,
      matched,
      skipped,
      unlinked: unlinked.length,
      softDeletedSkipped: softDeleted.length,
      unchanged,
      stockChanges: changes.length,
      increases,
      decreases,
      zeroTransitions: toZero + fromZero,
      toZero,
      fromZero,
      largeDifferences,
      duplicateSkus: audit.duplicateExternalIds.length,
      conflicts,
      invalidValues: audit.invalidStocks.length,
      negativeValues: audit.negativeStocks.length,
    },
    changes,
    samples: {
      unlinked: unlinked.slice(0, 10),
      softDeleted: softDeleted.slice(0, 10),
      duplicates: audit.duplicateExternalIds.slice(0, 10),
      invalidValues: audit.invalidStocks.slice(0, 10),
      negativeValues: audit.negativeStocks.slice(0, 10),
    },
  }
}
