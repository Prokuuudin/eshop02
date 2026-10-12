import type { ErpProduct } from './erp-adapter'
import type { GrinsXmlAudit } from './grins-xml-parser'
import { PREFLIGHT_THRESHOLDS } from './sync-preflight'
import { stockStructuralFailures } from './manual-stock-preview'

export interface StockSyncProductState {
  id: string
  externalId: string
  stock: number
  grinsStock: number | null
  isActive: boolean
  isDeleted: boolean
}

export interface StockSyncPreflight {
  hard: string[]
  warnings: string[]
  metrics: {
    rows: number
    previousProductsTotal: number | null
    matched: number
    unlinked: number
    softDeletedSkipped: number
    linkedMissingFromXml: number
    currentPhysicalSum: number
    incomingPhysicalSum: number
    activeZeroed: number
    linkedStockZero: number
  }
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`

/** Stock-only gates. Price fields are intentionally irrelevant. */
export function evaluateStockSyncPreflight(
  audit: GrinsXmlAudit,
  products: readonly ErpProduct[],
  linkedProducts: readonly StockSyncProductState[],
  previousProductsTotal: number | null,
): StockSyncPreflight {
  const hard = stockStructuralFailures(audit)
  const warnings: string[] = []
  const byExternalId = new Map(linkedProducts.map((product) => [product.externalId, product]))
  const xmlIds = new Set<string>()
  let matched = 0
  let unlinked = 0
  let softDeletedSkipped = 0
  let currentPhysicalSum = 0
  let incomingPhysicalSum = 0
  let activeInStock = 0
  let activeZeroed = 0
  let linkedStockZero = 0

  for (const product of products) {
    xmlIds.add(product.externalId)
    const current = byExternalId.get(product.externalId)
    if (!current) { unlinked++; continue }
    if (current.isDeleted) { softDeletedSkipped++; continue }
    matched++
    const physical = current.grinsStock ?? current.stock
    currentPhysicalSum += physical
    incomingPhysicalSum += product.stock
    if (product.stock === 0) linkedStockZero++
    if (current.isActive && physical > 0) {
      activeInStock++
      if (product.stock === 0) activeZeroed++
    }
  }

  const linkedMissingFromXml = linkedProducts.filter((row) => !row.isDeleted && !xmlIds.has(row.externalId)).length
  const metrics = {
    rows: products.length,
    previousProductsTotal,
    matched,
    unlinked,
    softDeletedSkipped,
    linkedMissingFromXml,
    currentPhysicalSum,
    incomingPhysicalSum,
    activeZeroed,
    linkedStockZero,
  }
  if (hard.length > 0 || products.length === 0) return { hard, warnings, metrics }

  const T = PREFLIGHT_THRESHOLDS
  if (products.length < T.feedMinRows) hard.push(`feed has ${products.length} rows (< absolute minimum ${T.feedMinRows})`)
  if (previousProductsTotal && previousProductsTotal > 0) {
    if (products.length < previousProductsTotal * T.feedMinRatio) hard.push(`feed shrank below ${T.feedMinRatio * 100}% of previous stock snapshot`)
    if (products.length > previousProductsTotal * T.feedMaxRatio) hard.push(`feed grew above ${T.feedMaxRatio * 100}% of previous stock snapshot`)
  } else {
    warnings.push('no previous completed stock snapshot; absolute gates only')
  }
  const linkedRatio = matched / products.length
  if (linkedRatio < T.linkedRatioHard) hard.push(`linked ratio ${pct(linkedRatio)} < ${pct(T.linkedRatioHard)}`)
  else if (linkedRatio < T.linkedRatioWarn) warnings.push(`linked ratio ${pct(linkedRatio)} < ${pct(T.linkedRatioWarn)}`)
  if (currentPhysicalSum > 0) {
    if (incomingPhysicalSum < currentPhysicalSum * (1 - T.stockSumDropHard)) hard.push(`physical stock sum drops more than ${pct(T.stockSumDropHard)}`)
    if (incomingPhysicalSum > currentPhysicalSum * T.stockSumGrowthHard) hard.push(`physical stock sum grows more than ${T.stockSumGrowthHard}x`)
  }
  if (activeInStock > 0 && activeZeroed / activeInStock > T.activeZeroedHard) hard.push(`too many active in-stock products become zero (${pct(activeZeroed / activeInStock)})`)
  if (matched > 0 && linkedStockZero / matched > T.linkedStockZeroHard) hard.push(`too many linked products have zero stock (${pct(linkedStockZero / matched)})`)
  if (linkedMissingFromXml) warnings.push(`${linkedMissingFromXml} linked Products are absent from XML and will remain unchanged`)
  if (unlinked > T.unlinkedWarn) warnings.push(`${unlinked} XML rows have no exact externalId match`)
  if (softDeletedSkipped) warnings.push(`${softDeletedSkipped} soft-deleted matches will remain unchanged`)
  return { hard, warnings, metrics }
}
