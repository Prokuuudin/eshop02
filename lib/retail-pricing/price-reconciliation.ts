/**
 * Read-only reconciliation of hairshop.lv (nopCommerce) retail prices against GrinS
 * price1/price2, by SKU. Pure functions: no database, no network, no personal data.
 *
 * Money is integer arithmetic only: nopCommerce decimals are parsed into 1/10000 units
 * (BigInt) and GrinS prices into cents; rounding is half-up to whole cents.
 */

export type NopProductRow = {
  productId: string
  sku: string
  published: boolean
  /** nopCommerce Product.Price as exported (4 decimals). */
  price: string
  oldPrice: string
  taxCategoryId: string
  /** Fixed tax rate percent for the product's tax category ('' when not configured). */
  taxRate: string
  isTaxExempt: boolean
  /** Store-wide taxsettings.pricesincludetax. */
  pricesIncludeTax: boolean
  /** Active product/category/manufacturer discounts, see parseDiscounts. */
  discounts: string
  name: string
}

export type GrinsPriceRow = { sku: string; price1: string; price2: string }

export type Discount = {
  id: string
  kind: 'percent' | 'amount'
  /** 1/10000 units: percent ×10000 or amount ×10000. */
  value: bigint
  /** 1/10000 EUR; 0 = no cap. */
  max: bigint
  requiresCoupon: boolean
  hasRequirements: boolean
  cumulative: boolean
}

export const CLASSIFICATIONS = ['matches_price1', 'matches_price2', 'separate_price', 'promotion', 'undetermined'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

export type ReconciliationRow = {
  sku: string
  nopProductId: string
  /** How the GrinS record was found: via the Hairshop Pro product's externalId, or by nopCommerce SKU. */
  matchedBy: MatchedBy
  published: boolean
  name: string
  grinsPrice1: string
  grinsPrice2: string
  nopNet: string
  nopGross: string
  nopOldPriceGross: string
  automaticDiscounts: string
  finalGross: string
  couponDiscounts: string
  conditionalDiscounts: string
  baseMatches: 'price1' | 'price2' | 'price1_and_price2' | 'none' | ''
  classification: Classification
  reasons: string
  /** Base price to keep after migration (gross, VAT incl.), before any B2C promotion. Empty = needs a decision. */
  preserveBasePrice: string
}

const UNITS = 10_000n

/** Strict non-negative decimal → 1/10000 units. Accepts sqlcmd's ".0000". Null if not a decimal. */
export function parseUnits(text: string): bigint | null {
  const value = text.trim()
  if (value === '' || value.toUpperCase() === 'NULL') return null
  const normalized = value.startsWith('.') ? `0${value}` : value
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(normalized)
  if (!match) return null
  const fraction = (match[2] ?? '').padEnd(5, '0')
  const truncated = BigInt(match[1]) * UNITS + BigInt(fraction.slice(0, 4))
  return Number(fraction[4]) >= 5 ? truncated + 1n : truncated
}

/** 1/10000 units → whole cents, half-up. */
const unitsToCents = (units: bigint): bigint => (units + 50n) / 100n

export function formatCents(cents: bigint | null): string {
  if (cents === null) return ''
  const whole = cents / 100n
  const fraction = (cents % 100n).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

/** GrinS price string → cents, or null when missing/invalid/non-positive. */
export function grinsCents(text: string): bigint | null {
  const units = parseUnits(text)
  if (units === null) return null
  const cents = unitsToCents(units)
  return cents > 0n ? cents : null
}

/** Net 1/10000 units × (1 + rate%) → gross cents, half-up (nopCommerce "including tax" display). */
export function grossCents(netUnits: bigint, rateUnits: bigint): bigint {
  const numerator = netUnits * (1_000_000n + rateUnits)
  return (numerator + 50_000_000n) / 100_000_000n
}

/** "id:p20.0000:0.0000:crk;…" — flags: c coupon, r requirements, k cumulative. */
export function parseDiscounts(text: string): Discount[] {
  return text.split(';').map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const [id, amount = '', max = '', flags = ''] = part.split(':')
    const kind = amount.startsWith('p') ? 'percent' : amount.startsWith('a') ? 'amount' : null
    const value = parseUnits(amount.slice(1))
    const cap = parseUnits(max) ?? 0n
    if (!id || !kind || value === null) return []
    return [{ id, kind, value, max: cap, requiresCoupon: flags.includes('c'), hasRequirements: flags.includes('r'), cumulative: flags.includes('k') } satisfies Discount]
  })
}

function discountUnits(netUnits: bigint, discount: Discount): bigint {
  const raw = discount.kind === 'percent' ? (netUnits * discount.value + 500_000n) / 1_000_000n : discount.value
  return discount.max > 0n && raw > discount.max ? discount.max : raw
}

/** nopCommerce-like preferred automatic discount: the larger of the best single and the cumulative sum. */
export function bestAutomaticDiscount(netUnits: bigint, discounts: readonly Discount[]): { units: bigint; ids: string[] } {
  const automatic = discounts.filter((discount) => !discount.requiresCoupon && !discount.hasRequirements)
  let best = { units: 0n, ids: [] as string[] }
  for (const discount of automatic) {
    const units = discountUnits(netUnits, discount)
    if (units > best.units) best = { units, ids: [discount.id] }
  }
  const cumulative = automatic.filter((discount) => discount.cumulative)
  const cumulativeUnits = cumulative.reduce((sum, discount) => sum + discountUnits(netUnits, discount), 0n)
  if (cumulative.length > 1 && cumulativeUnits > best.units) best = { units: cumulativeUnits, ids: cumulative.map((discount) => discount.id) }
  return { units: best.units > netUnits ? netUnits : best.units, ids: best.ids }
}

const describeDiscount = (discount: Discount) =>
  `${discount.id}:${discount.kind === 'percent' ? `${formatCents(unitsToCents(discount.value))}%` : `${formatCents(unitsToCents(discount.value))}EUR`}`

export type MatchedBy = 'pro_external_id' | 'sku' | ''

export function reconcileProduct(
  nop: NopProductRow,
  grins: GrinsPriceRow | undefined,
  flags: { duplicateNopSku: boolean; duplicateGrinsSku: boolean; matchedBy: MatchedBy },
): ReconciliationRow {
  const reasons: string[] = []
  const netUnits = parseUnits(nop.price)
  const oldUnits = parseUnits(nop.oldPrice)
  const rateUnits = nop.isTaxExempt ? 0n : parseUnits(nop.taxRate)
  const discounts = parseDiscounts(nop.discounts)
  const coupon = discounts.filter((discount) => discount.requiresCoupon)
  const conditional = discounts.filter((discount) => discount.hasRequirements && !discount.requiresCoupon)
  const p1 = grins ? grinsCents(grins.price1) : null
  const p2 = grins ? grinsCents(grins.price2) : null

  if (!flags.matchedBy) reasons.push('no_match_key')
  if (flags.matchedBy === 'sku' && flags.duplicateNopSku) reasons.push('nop_sku_duplicate')
  if (flags.duplicateGrinsSku) reasons.push('grins_sku_duplicate')
  if (flags.matchedBy && !grins) reasons.push('grins_item_missing')
  if (netUnits === null || netUnits <= 0n) reasons.push('nop_price_missing')
  if (rateUnits === null) reasons.push('tax_rate_unknown')
  if (nop.isTaxExempt) reasons.push('nop_tax_exempt')
  if (conditional.length) reasons.push('conditional_discount')

  const toGross = (units: bigint | null) => (units === null || rateUnits === null ? null : nop.pricesIncludeTax ? unitsToCents(units) : grossCents(units, rateUnits))
  const gross = netUnits !== null && netUnits > 0n ? toGross(netUnits) : null
  const oldGross = oldUnits !== null && oldUnits > 0n ? toGross(oldUnits) : null
  const best = netUnits !== null && netUnits > 0n ? bestAutomaticDiscount(netUnits, discounts) : { units: 0n, ids: [] }
  const finalGross = netUnits !== null && gross !== null ? toGross(netUnits - best.units) : null

  const matches1 = gross !== null && p1 !== null && gross === p1
  const matches2 = gross !== null && p2 !== null && gross === p2
  const baseMatches = gross === null ? '' : matches1 && matches2 ? 'price1_and_price2' : matches1 ? 'price1' : matches2 ? 'price2' : 'none'

  // Any blocking reason needs a human decision; promotion markers below are informational.
  const undetermined = reasons.length > 0
  const onPromotion = best.units > 0n || (oldGross !== null && gross !== null && oldGross > gross)
  if (best.units > 0n) reasons.push('automatic_discount')
  if (oldGross !== null && gross !== null && oldGross > gross) reasons.push('old_price_shown')

  let classification: Classification
  if (undetermined) classification = 'undetermined'
  else if (onPromotion) classification = 'promotion'
  else if (matches1) classification = 'matches_price1'
  else if (matches2) classification = 'matches_price2'
  else classification = 'separate_price'

  return {
    sku: nop.sku,
    nopProductId: nop.productId,
    matchedBy: flags.matchedBy,
    published: nop.published,
    name: nop.name,
    grinsPrice1: formatCents(p1),
    grinsPrice2: formatCents(p2),
    nopNet: nop.price.trim(),
    nopGross: formatCents(gross),
    nopOldPriceGross: formatCents(oldGross),
    automaticDiscounts: discounts.filter((discount) => !discount.requiresCoupon && !discount.hasRequirements).map(describeDiscount).join(' '),
    finalGross: formatCents(finalGross),
    couponDiscounts: coupon.map(describeDiscount).join(' '),
    conditionalDiscounts: conditional.map(describeDiscount).join(' '),
    baseMatches,
    classification,
    reasons: reasons.join(' '),
    preserveBasePrice: classification === 'undetermined' ? '' : formatCents(gross),
  }
}

export type ReconciliationSummary = {
  nopProducts: number
  nopPublished: number
  grinsItems: number
  grinsOnlySkus: number
  matchedByProExternalId: number
  matchedBySku: number
  byClassification: Record<Classification, number>
  publishedByClassification: Record<Classification, number>
  promotionBaseMatches: Record<string, number>
}

/** Hairshop Pro product ids for a nopCommerce product: migrated ("12483") or catalog-synced ("nop390-12483"). */
export const proIdsForNopProduct = (nopProductId: string): string[] => [nopProductId, `nop390-${nopProductId}`]

/**
 * proLinks: Hairshop Pro Product.id → externalId (GrinS SKU), optional. When given, the
 * Pro link is preferred over the nopCommerce SKU (which is missing or duplicated for
 * part of the catalogue).
 */
export function reconcile(
  nopRows: readonly NopProductRow[],
  grinsRows: readonly GrinsPriceRow[],
  proLinks: ReadonlyMap<string, string> = new Map(),
): { rows: ReconciliationRow[]; summary: ReconciliationSummary } {
  const count = (values: string[]) => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())
  const nopSkuCount = count(nopRows.map((row) => row.sku).filter(Boolean))
  const grinsSkuCount = count(grinsRows.map((row) => row.sku))
  const grinsBySku = new Map(grinsRows.map((row) => [row.sku, row]))
  const rows = nopRows.map((nop) => {
    const linked = proIdsForNopProduct(nop.productId).map((id) => proLinks.get(id)).find(Boolean)
    const key = linked ?? nop.sku
    const matchedBy: MatchedBy = linked ? 'pro_external_id' : nop.sku ? 'sku' : ''
    return reconcileProduct(nop, key ? grinsBySku.get(key) : undefined, {
      duplicateNopSku: (nopSkuCount.get(nop.sku) ?? 0) > 1,
      duplicateGrinsSku: key ? (grinsSkuCount.get(key) ?? 0) > 1 : false,
      matchedBy,
    })
  })
  const linkedExternalIds = new Set(proLinks.values())
  const empty = () => Object.fromEntries(CLASSIFICATIONS.map((key) => [key, 0])) as Record<Classification, number>
  const byClassification = empty()
  const publishedByClassification = empty()
  const promotionBaseMatches: Record<string, number> = {}
  for (const row of rows) {
    byClassification[row.classification]++
    if (row.published) publishedByClassification[row.classification]++
    if (row.classification === 'promotion') promotionBaseMatches[row.baseMatches || 'unknown'] = (promotionBaseMatches[row.baseMatches || 'unknown'] ?? 0) + 1
  }
  return {
    rows,
    summary: {
      nopProducts: nopRows.length,
      nopPublished: nopRows.filter((row) => row.published).length,
      grinsItems: grinsRows.length,
      grinsOnlySkus: [...grinsBySku.keys()].filter((sku) => !nopSkuCount.has(sku) && !linkedExternalIds.has(sku)).length,
      matchedByProExternalId: rows.filter((row) => row.matchedBy === 'pro_external_id').length,
      matchedBySku: rows.filter((row) => row.matchedBy === 'sku').length,
      byClassification,
      publishedByClassification,
      promotionBaseMatches,
    },
  }
}

/** Tab-separated export of scripts/sql/nop-retail-price-export.sql (header row optional). */
export function parseNopExport(tsv: string): NopProductRow[] {
  return tsv.replace(/^﻿/u, '').split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => line.split('\t'))
    .filter((cells) => cells[0] !== 'ProductId' && /^\d+$/u.test(cells[0]?.trim() ?? ''))
    .map((cells) => {
      const cell = (index: number) => (cells[index] ?? '').trim()
      const flag = (index: number) => cell(index) === '1' || cell(index).toLowerCase() === 'true'
      return {
        productId: cell(0), sku: cell(1) === 'NULL' ? '' : cell(1), published: flag(2), price: cell(3), oldPrice: cell(4),
        taxCategoryId: cell(5), taxRate: cell(6) === 'NULL' ? '' : cell(6), isTaxExempt: flag(7), pricesIncludeTax: flag(8),
        discounts: cell(9) === 'NULL' ? '' : cell(9), name: cell(10) === 'NULL' ? '' : cell(10),
      }
    })
}

/** Tab-separated "id<TAB>externalId" export of Hairshop Pro linked products (header row optional). */
export function parseProLinks(tsv: string): Map<string, string> {
  const links = new Map<string, string>()
  for (const line of tsv.replace(/^﻿/u, '').split(/\r?\n/u)) {
    const [id = '', externalId = ''] = line.split('\t').map((cell) => cell.trim())
    if (id && externalId && id !== 'id' && externalId !== 'NULL') links.set(id, externalId)
  }
  return links
}

const CSV_COLUMNS: Array<keyof ReconciliationRow> = [
  'sku', 'nopProductId', 'matchedBy', 'published', 'name', 'grinsPrice1', 'grinsPrice2', 'nopNet', 'nopGross', 'nopOldPriceGross',
  'automaticDiscounts', 'finalGross', 'couponDiscounts', 'conditionalDiscounts', 'baseMatches', 'classification', 'reasons', 'preserveBasePrice',
]

export function toCsv(rows: readonly ReconciliationRow[]): string {
  const escape = (value: unknown) => {
    const text = String(value)
    // Neutralise spreadsheet formulas in free text (product names).
    const safe = /^[=+\-@]/u.test(text) ? `'${text}` : text
    return /[",\n\r;]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe
  }
  return [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((column) => escape(row[column])).join(','))].join('\n') + '\n'
}
