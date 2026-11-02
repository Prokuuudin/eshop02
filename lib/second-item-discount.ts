/**
 * "Second item of the same brand" campaign: in every pair of eligible units the cheaper
 * unit is discounted. Pure and dependency-free so the same rules are used by order
 * pricing, the cart preview and admin validation.
 *
 * All money math is integer cents. Euro inputs (already 2-decimal catalog prices) are
 * converted once with toCents; the result is converted back only by callers.
 */

export const SECOND_ITEM_DISCOUNT_TYPE = 'second_item_discount'
export const CAMPAIGN_TIME_ZONE = 'Europe/Riga'

export type SecondItemSettings = {
  targetBrands: string[]
  discountPercent: number
  /** Empty: every product of the brand participates. */
  productIds?: string[]
  excludedProductIds?: string[]
  excludeSaleItems?: boolean
  /** null/undefined: no limit on the number of pairs per order. */
  maxPairs?: number | null
}

export type SecondItemCampaignConfig = SecondItemSettings & {
  id: string
  name?: string
  startDate: string
  endDate: string
  active: boolean
}

export type SecondItemLine = {
  id: string
  quantity: number
  /** Authoritative unit price after bulk tiers, euros. */
  price: number
  oldPrice?: number | null
  brand?: string
  fromCatalog: boolean
}

export type SecondItemLineDiscount = {
  /** Index of the line in the priced item list. */
  index: number
  campaignId: string
  discountedUnits: number
  discountCents: number
}

export type SecondItemResult = {
  discountCents: number
  eligibleCents: number
  lines: SecondItemLineDiscount[]
}

export function toCents(euros: number): number {
  return Number.isFinite(euros) ? Math.round(euros * 100) : 0
}

export function normalizeBrand(value: string | undefined | null): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Calendar day (YYYY-MM-DD) in Europe/Riga, independent of the server time zone. */
export function rigaDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Runs from 00:00 of startDate to the end of endDate, both Riga calendar days. */
export function isSecondItemCampaignActive(campaign: Pick<SecondItemCampaignConfig, 'active' | 'startDate' | 'endDate'>, now = new Date()): boolean {
  const start = String(campaign.startDate ?? '').slice(0, 10)
  const end = String(campaign.endDate ?? '').slice(0, 10)
  if (!campaign.active || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return false
  const today = rigaDay(now)
  return start <= today && (!end || today <= end)
}

function validPercent(value: unknown): number | null {
  const percent = Number(value)
  return Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : null
}

function validMaxPairs(value: unknown): number | null {
  const pairs = Number(value)
  return Number.isInteger(pairs) && pairs >= 1 ? pairs : null
}

/** Product-level eligibility (brand, product lists, sale exclusion, positive price). */
export function isSecondItemProductEligible(
  settings: SecondItemSettings,
  product: { id: string; price: number; oldPrice?: number | null; brand?: string },
): boolean {
  const brand = normalizeBrand(settings.targetBrands?.[0])
  if (!brand || normalizeBrand(product.brand) !== brand) return false
  if (toCents(product.price) <= 0) return false
  const productIds = Array.isArray(settings.productIds) ? settings.productIds : []
  if (productIds.length > 0 && !productIds.includes(product.id)) return false
  if (Array.isArray(settings.excludedProductIds) && settings.excludedProductIds.includes(product.id)) return false
  if (settings.excludeSaleItems && product.oldPrice != null && product.oldPrice > product.price) return false
  return true
}

/**
 * Units of all eligible lines are sorted by unit price, most expensive first, and paired
 * in that order; the second unit of every pair is discounted. Prices 10/8/6/4 give the
 * pairs (10, 8) and (6, 4), so 8 and 4 are discounted. An odd unit stays unpaired.
 * maxPairs keeps the first (most expensive) pairs.
 */
export function calculateSecondItemDiscount(
  campaign: SecondItemSettings & { id: string },
  lines: readonly SecondItemLine[],
  skipIndexes: ReadonlySet<number> = new Set(),
): SecondItemResult {
  const empty: SecondItemResult = { discountCents: 0, eligibleCents: 0, lines: [] }
  const percent = validPercent(campaign.discountPercent)
  if (percent === null) return empty

  const groups = lines.flatMap((line, index) => {
    const quantity = Number(line.quantity)
    if (skipIndexes.has(index) || !line.fromCatalog || !Number.isInteger(quantity) || quantity <= 0) return []
    if (!isSecondItemProductEligible(campaign, line)) return []
    return [{ index, quantity, unitCents: toCents(line.price) }]
  }).sort((a, b) => b.unitCents - a.unitCents || a.index - b.index)

  const units = groups.reduce((sum, group) => sum + group.quantity, 0)
  const maxPairs = validMaxPairs(campaign.maxPairs)
  const pairs = Math.min(Math.floor(units / 2), maxPairs ?? Number.POSITIVE_INFINITY)
  const pairedUnits = pairs * 2

  let position = 0
  let discountCents = 0
  let eligibleCents = 0
  const discounted: SecondItemLineDiscount[] = []
  for (const group of groups) {
    const start = position
    position += group.quantity
    eligibleCents += group.unitCents * group.quantity
    const limit = Math.min(position, pairedUnits)
    // Discounted units sit at the odd positions of the sorted unit list.
    const discountedUnits = limit > start ? Math.floor(limit / 2) - Math.floor(start / 2) : 0
    if (discountedUnits <= 0) continue
    // Round half up, in integers.
    const lineDiscount = Math.floor((group.unitCents * discountedUnits * percent + 50) / 100)
    discountCents += lineDiscount
    discounted.push({ index: group.index, campaignId: campaign.id, discountedUnits, discountCents: lineDiscount })
  }

  discounted.sort((a, b) => a.index - b.index)
  return { discountCents, eligibleCents, lines: discounted }
}

/**
 * Applies several second-item campaigns. Results add up across brands; a line used by an
 * earlier campaign is never discounted again by a later one.
 */
export function calculateSecondItemCampaigns(
  campaigns: ReadonlyArray<SecondItemSettings & { id: string }>,
  lines: readonly SecondItemLine[],
): SecondItemResult & { campaignIds: string[] } {
  const used = new Set<number>()
  const result: SecondItemResult & { campaignIds: string[] } = { discountCents: 0, eligibleCents: 0, lines: [], campaignIds: [] }
  for (const campaign of campaigns) {
    const own = calculateSecondItemDiscount(campaign, lines, used)
    lines.forEach((line, index) => {
      if (!used.has(index) && line.fromCatalog && isSecondItemProductEligible(campaign, line)) used.add(index)
    })
    if (own.discountCents <= 0) continue
    result.discountCents += own.discountCents
    result.eligibleCents += own.eligibleCents
    result.lines.push(...own.lines)
    result.campaignIds.push(campaign.id)
  }
  result.lines.sort((a, b) => a.index - b.index)
  return result
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))] : []
}

export type SecondItemValidationError =
  | 'brand_required'
  | 'invalid_discount_percent'
  | 'invalid_max_pairs'

/** Normalizes admin input for a second-item campaign. */
export function normalizeSecondItemSettings(input: Record<string, unknown>):
  | { ok: true; value: Required<Omit<SecondItemSettings, 'maxPairs'>> & { maxPairs: number | null } }
  | { ok: false; error: SecondItemValidationError } {
  const brands = uniqueStrings(input.targetBrands)
  if (brands.length !== 1) return { ok: false, error: 'brand_required' }
  const discountPercent = validPercent(input.discountPercent)
  if (discountPercent === null) return { ok: false, error: 'invalid_discount_percent' }
  const rawMaxPairs = input.maxPairs
  const unlimited = rawMaxPairs === null || rawMaxPairs === undefined || rawMaxPairs === '' || rawMaxPairs === 0
  const maxPairs = unlimited ? null : validMaxPairs(rawMaxPairs)
  if (!unlimited && maxPairs === null) return { ok: false, error: 'invalid_max_pairs' }
  return {
    ok: true,
    value: {
      targetBrands: brands,
      discountPercent,
      productIds: uniqueStrings(input.productIds),
      excludedProductIds: uniqueStrings(input.excludedProductIds),
      excludeSaleItems: input.excludeSaleItems === true,
      maxPairs,
    },
  }
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aTo = aEnd || '9999-12-31'
  const bTo = bEnd || '9999-12-31'
  return aStart <= bTo && bStart <= aTo
}

/**
 * Another second-item campaign for the same brand whose dates intersect. Inactive
 * campaigns count too: they can be switched on later without passing validation again.
 */
export function findOverlappingSecondItemCampaign<T extends { id: string; type: string; startDate: string; endDate: string; targetBrands?: string[] }>(
  campaigns: readonly T[],
  candidate: { id?: string; startDate: string; endDate: string; targetBrands: string[] },
): T | undefined {
  const brand = normalizeBrand(candidate.targetBrands[0])
  return campaigns.find((campaign) => campaign.id !== candidate.id
    && campaign.type === SECOND_ITEM_DISCOUNT_TYPE
    && normalizeBrand(campaign.targetBrands?.[0]) === brand
    && rangesOverlap(
      String(campaign.startDate ?? '').slice(0, 10), String(campaign.endDate ?? '').slice(0, 10),
      candidate.startDate.slice(0, 10), candidate.endDate.slice(0, 10),
    ))
}
