import { Buffer } from 'node:buffer'
import { centsToMoneyString } from '../integer-money'
import { normalizeGtin, normalizeSku } from '../matching-normalization'
import { normalizeObservation, observationStateHash, parseStrictPriceString, type NormalizedObservation } from '../observation'
import type { AggregatePriceInfo, CompetitorAdapter, ParseFailure, ParseFailureCode, ParsedListing, ParseWarningCode } from './types'

// schema.org JSON-LD Product adapter.
//
// Principle: no observation is better than a wrong observation. The adapter never picks
// "the first" or "the cheapest" product/offer: anything it cannot prove unambiguous fails
// with a typed code. JavaScript is never executed; only <script type="application/ld+json">
// contents are read and parsed with JSON.parse. URLs inside JSON-LD are metadata only.

export const MAX_JSON_LD_BLOCKS = 32
export const MAX_JSON_LD_BLOCK_BYTES = 256 * 1024
export const MAX_JSON_LD_TOTAL_BYTES = 512 * 1024
export const MAX_JSON_LD_NODES = 10_000
/** Nesting of @graph containers / root arrays that is traversed for entities. */
export const MAX_JSON_LD_DEPTH = 8
/** Offers, nested AggregateOffer offers and priceSpecifications per entity. */
export const MAX_JSON_LD_LIST_ITEMS = 100
const MAX_IDENTIFIER_LENGTH = 200

type JsonRecord = Record<string, unknown>

const DUPLICATE_ID = Symbol('duplicate-id')
type Resolved = JsonRecord | typeof DUPLICATE_ID
type IdIndex = ReadonlyMap<string, Resolved>

class ParseStop extends Error {
  constructor(readonly code: ParseFailureCode, readonly aggregate?: AggregatePriceInfo) {
    super(code)
  }
}

function failure(code: ParseFailureCode, aggregate?: AggregatePriceInfo): ParseFailure {
  return aggregate ? { ok: false, code, aggregate } : { ok: false, code }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// --- HTML scanning ---------------------------------------------------------------------

const TYPE_ATTRIBUTE_PATTERN = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i

function mediaType(attributes: string): string | null {
  const match = TYPE_ATTRIBUTE_PATTERN.exec(attributes)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value ? value.split(';', 1)[0].trim().toLowerCase() : null
}

/**
 * Linear scanner (no regex over the whole document): skips HTML comments, and for each
 * <script> element reads raw text up to the first `</script` exactly like a browser does.
 * Only blocks whose type is application/ld+json are returned.
 */
function extractJsonLdBlocks(html: string): { ok: true; blocks: string[] } | ParseFailure {
  const lower = html.toLowerCase()
  const blocks: string[] = []
  let totalBytes = 0
  let index = 0
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) break
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4)
      if (end === -1) break
      index = end + 3
      continue
    }
    if (lower.startsWith('<script', open) && /[\s>/]/.test(html[open + 7] ?? '')) {
      const tagEnd = html.indexOf('>', open + 7)
      if (tagEnd === -1) break
      const close = lower.indexOf('</script', tagEnd + 1)
      const content = html.slice(tagEnd + 1, close === -1 ? html.length : close)
      if (mediaType(html.slice(open + 7, tagEnd)) === 'application/ld+json') {
        if (blocks.length >= MAX_JSON_LD_BLOCKS) return failure('too_many_jsonld_blocks')
        const bytes = Buffer.byteLength(content, 'utf8')
        if (bytes > MAX_JSON_LD_BLOCK_BYTES) return failure('jsonld_block_too_large')
        totalBytes += bytes
        if (totalBytes > MAX_JSON_LD_TOTAL_BYTES) return failure('jsonld_total_too_large')
        blocks.push(content.replace(/^﻿/, '').trim())
      }
      if (close === -1) break
      const closeEnd = html.indexOf('>', close)
      index = closeEnd === -1 ? html.length : closeEnd + 1
      continue
    }
    index = open + 1
  }
  return blocks.length === 0 ? failure('no_jsonld') : { ok: true, blocks }
}

// --- JSON-LD graph ----------------------------------------------------------------------

/** Top-level entities: root objects, root arrays and @graph members (bounded depth/count). */
function collectNodes(blocks: string[]): JsonRecord[] | ParseFailure {
  const nodes: JsonRecord[] = []
  const seen = new Set<object>()
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block)
    } catch {
      // A broken block may hide a second Product or price: fail closed.
      return failure('invalid_jsonld')
    }
    const pending: Array<{ value: unknown; depth: number }> = [{ value: parsed, depth: 0 }]
    while (pending.length > 0) {
      const { value, depth } = pending.pop()!
      if (depth > MAX_JSON_LD_DEPTH) return failure('jsonld_too_complex')
      if (Array.isArray(value)) {
        if (seen.has(value)) continue
        seen.add(value)
        if (value.length > MAX_JSON_LD_NODES) return failure('jsonld_too_complex')
        for (let i = value.length - 1; i >= 0; i -= 1) pending.push({ value: value[i], depth: depth + 1 })
        continue
      }
      if (!isRecord(value) || seen.has(value)) continue
      seen.add(value)
      nodes.push(value)
      if (nodes.length > MAX_JSON_LD_NODES) return failure('jsonld_too_complex')
      if (Object.hasOwn(value, '@graph')) pending.push({ value: value['@graph'], depth: depth + 1 })
    }
  }
  return nodes
}

function buildIdIndex(nodes: readonly JsonRecord[]): Map<string, Resolved> {
  const index = new Map<string, Resolved>()
  for (const node of nodes) {
    const id = node['@id']
    if (typeof id !== 'string') continue
    const existing = index.get(id)
    index.set(id, existing === undefined || existing === node ? node : DUPLICATE_ID)
  }
  return index
}

/** Resolves a value or list of values to records, following @id references. */
function resolveList(value: unknown, ids: IdIndex): Resolved[] {
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [value]
  if (values.length > MAX_JSON_LD_LIST_ITEMS) throw new ParseStop('jsonld_too_complex')
  const out: Resolved[] = []
  for (const entry of values) {
    if (!isRecord(entry)) continue
    const id = typeof entry['@id'] === 'string' ? entry['@id'] : null
    const target = id !== null ? ids.get(id) : undefined
    out.push(target ?? entry)
  }
  return out
}

const SCHEMA_TERM = /^(?:(?:https?:\/\/)?(?:www\.)?schema\.org\/|schema:)?([A-Za-z][A-Za-z0-9]*)$/

/** schema.org term (lower-case) for a bare or schema.org-namespaced value; other vocabularies → null. */
function schemaTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = SCHEMA_TERM.exec(value.trim())
  return match ? match[1].toLowerCase() : null
}

function hasType(record: JsonRecord, term: string): boolean {
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
  return types.some((value) => schemaTerm(value) === term)
}

// --- text and identifiers ---------------------------------------------------------------

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength)
}

function textOf(value: unknown, maxLength: number): string | null {
  return cleanText(value, maxLength) ?? (isRecord(value) ? cleanText(value.name, maxLength) : null)
}

const GTIN_FIELDS: ReadonlyArray<readonly [string, number | null]> = [
  ['gtin', null],
  ['gtin8', 8],
  ['gtin12', 12],
  ['gtin13', 13],
  ['gtin14', 14],
]

type ProductMetadata = Omit<ParsedListing, 'ok' | 'url' | 'observation' | 'aggregate' | 'warnings'> & {
  entityId: string | null
  warnings: ParseWarningCode[]
}

function productMetadata(product: JsonRecord): ProductMetadata {
  const warnings: ParseWarningCode[] = []
  // GS1: a GTIN-8/12/13 zero-padded to 14 digits is the same identifier.
  const gtins = new Map<string, string>()
  let sawGtinField = false
  for (const [field, length] of GTIN_FIELDS) {
    const value = product[field]
    if (value === undefined || value === null || value === '') continue
    sawGtinField = true
    // A JSON number may already have lost leading zeros: never trusted as GTIN.
    if (typeof value !== 'string') {
      warnings.push('malformed_identifier')
      continue
    }
    const normalized = normalizeGtin(value)
    if (normalized.kind !== 'valid_gtin' || (length !== null && normalized.value.length !== length)) {
      warnings.push('malformed_identifier')
      continue
    }
    const key = normalized.value.padStart(14, '0')
    const existing = gtins.get(key)
    if (existing === undefined || normalized.value.length < existing.length) gtins.set(key, normalized.value)
  }
  if (gtins.size > 1) warnings.push('conflicting_identifiers')
  if (!sawGtinField) warnings.push('missing_gtin')

  const identifier = (field: string): string | null => {
    const value = product[field]
    if (value === undefined || value === null || value === '') return null
    const text = typeof value === 'string' ? cleanText(value, Number.MAX_SAFE_INTEGER) : null
    if (text === null || text.length > MAX_IDENTIFIER_LENGTH) {
      warnings.push('malformed_identifier')
      return null
    }
    return text
  }
  const sku = identifier('sku')
  const mpn = identifier('mpn')
  const hasField = (field: string) => product[field] !== undefined && product[field] !== null && product[field] !== ''
  if (!hasField('sku') && !hasField('mpn')) warnings.push('missing_sku')

  return {
    entityId: typeof product['@id'] === 'string' ? product['@id'] : null,
    sourceProductId: identifier('productID') ?? (typeof product['@id'] === 'string' && product['@id'].length <= MAX_IDENTIFIER_LENGTH ? product['@id'] : null),
    title: textOf(product.name, 1_000),
    brand: textOf(product.brand, 300),
    ean: gtins.size === 1 ? [...gtins.values()][0] : null,
    manufacturerSku: sku ?? mpn,
    sizeText: textOf(product.size, 300),
    warnings,
  }
}

// --- prices -----------------------------------------------------------------------------

type MachinePrice = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'non_positive' } | { kind: 'value'; cents: number }

/**
 * Machine-readable prices only: JSON number or a plain decimal string ("12", "12.3", "12.34").
 * Rejected: locale separators, grouping, currency symbols, signs other than '-', exponents, text.
 */
export function parseJsonLdPrice(value: unknown): MachinePrice {
  if (value === undefined || value === null || value === '') return { kind: 'missing' }
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { kind: 'invalid' }
    text = String(value)
  } else if (typeof value === 'string') {
    text = value
  } else {
    return { kind: 'invalid' }
  }
  const parsed = parseStrictPriceString(text)
  if ('error' in parsed) return parsed.error === 'non_positive_price' ? { kind: 'non_positive' } : { kind: 'invalid' }
  return parsed.cents === null ? { kind: 'missing' } : { kind: 'value', cents: parsed.cents }
}

function currencyKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null
}

function availabilityFromSchema(value: unknown): NormalizedObservation['availability'] {
  switch (schemaTerm(value)) {
    case 'instock':
    case 'limitedavailability':
    case 'onlineonly':
    case 'instoreonly':
      return 'in_stock'
    case 'outofstock':
    case 'soldout':
    case 'discontinued':
      return 'out_of_stock'
    case 'preorder':
    case 'presale':
    case 'backorder':
      return 'preorder'
    default:
      return 'unknown'
  }
}

// PriceSpecification fields that change what the price means (per unit, quantity tiers,
// ranges, time windows, components). Such specifications are never used as product price.
const QUALIFIED_SPECIFICATION_FIELDS = [
  'referenceQuantity', 'eligibleQuantity', 'eligibleTransactionVolume', 'minPrice', 'maxPrice',
  'validFrom', 'validThrough', 'priceComponentType', 'billingDuration', 'billingIncrement', 'billingStart',
  'unitCode', 'unitText',
]
const REFERENCE_PRICE_TYPES = new Set(['listprice', 'strikethroughprice'])

/** Failure priority: independent of JSON order, most specific first. */
const FAILURE_PRIORITY: readonly ParseFailureCode[] = [
  'conflicting_currencies',
  'ambiguous_offers',
  'invalid_price',
  'non_positive_price',
  'missing_currency',
  'unsupported_currency',
  'inconsistent_price_semantics',
]

function strongestFailure(codes: readonly ParseFailureCode[]): ParseFailureCode {
  return FAILURE_PRIORITY.find((code) => codes.includes(code)) ?? [...codes].sort()[0]
}

type PricedOffer = {
  observedCents: number
  currency: string
  regularCents: number | null
  availability: NormalizedObservation['availability']
  warnings: ParseWarningCode[]
}

type OfferResult =
  | { kind: 'priced'; offer: PricedOffer }
  | { kind: 'ignored'; reason: 'unpriced' | 'condition'; warnings: ParseWarningCode[] }
  | { kind: 'failure'; code: ParseFailureCode }

type PriceInput = { price: unknown; currency: unknown }

function evaluateOffer(offer: JsonRecord, ids: IdIndex, productAvailability: unknown): OfferResult {
  const warnings: ParseWarningCode[] = []
  if (offer.itemCondition !== undefined && schemaTerm(offer.itemCondition) !== 'newcondition') {
    return { kind: 'ignored', reason: 'condition', warnings: ['non_new_condition_offer_ignored'] }
  }

  const current: PriceInput[] = []
  const reference: PriceInput[] = []
  if (offer.price !== undefined && offer.price !== null && offer.price !== '') {
    current.push({ price: offer.price, currency: offer.priceCurrency })
  }
  for (const spec of resolveList(offer.priceSpecification, ids)) {
    if (spec === DUPLICATE_ID) return { kind: 'failure', code: 'ambiguous_offers' }
    const supportedType = hasType(spec, 'unitpricespecification') || hasType(spec, 'pricespecification')
    if (!supportedType || QUALIFIED_SPECIFICATION_FIELDS.some((field) => spec[field] !== undefined)) {
      warnings.push('unsupported_price_specification_ignored')
      continue
    }
    if (spec.price === undefined || spec.price === null || spec.price === '') {
      warnings.push('unsupported_price_specification_ignored')
      continue
    }
    const input = { price: spec.price, currency: spec.priceCurrency ?? offer.priceCurrency }
    if (spec.priceType === undefined) {
      current.push(input)
    } else if (REFERENCE_PRICE_TYPES.has(schemaTerm(spec.priceType) ?? '')) {
      reference.push(input)
    } else {
      warnings.push('unsupported_price_specification_ignored')
    }
  }

  if (current.length === 0) {
    return { kind: 'ignored', reason: 'unpriced', warnings: [...warnings, reference.length > 0 ? 'reference_price_ignored' : 'offer_without_price_ignored'] }
  }

  const cents = new Set<number>()
  const currencies = new Set<string>()
  for (const item of current) {
    const price = parseJsonLdPrice(item.price)
    if (price.kind === 'invalid') return { kind: 'failure', code: 'invalid_price' }
    if (price.kind === 'non_positive') return { kind: 'failure', code: 'non_positive_price' }
    if (price.kind === 'missing') continue
    const currency = currencyKey(item.currency)
    if (currency === null) return { kind: 'failure', code: 'missing_currency' }
    cents.add(price.cents)
    currencies.add(currency)
  }
  if (currencies.size > 1) return { kind: 'failure', code: 'conflicting_currencies' }
  if (cents.size > 1) return { kind: 'failure', code: 'ambiguous_offers' }
  if (cents.size === 0) return { kind: 'ignored', reason: 'unpriced', warnings: [...warnings, 'offer_without_price_ignored'] }
  const observedCents = [...cents][0]
  const currency = [...currencies][0]

  // Reference (list/strikethrough) price: literal schema.org semantics only.
  const referenceCents = new Set<number>()
  for (const item of reference) {
    const price = parseJsonLdPrice(item.price)
    if (price.kind !== 'value' || currencyKey(item.currency) !== currency) {
      warnings.push('reference_price_ignored')
      continue
    }
    referenceCents.add(price.cents)
  }
  let regularCents: number | null = null
  if (referenceCents.size > 1) {
    warnings.push('conflicting_reference_prices')
  } else if (referenceCents.size === 1) {
    const value = [...referenceCents][0]
    if (value >= observedCents) regularCents = value
    else warnings.push('reference_price_ignored')
  }

  const rawAvailability = offer.availability ?? productAvailability
  const availability = availabilityFromSchema(rawAvailability)
  if (rawAvailability !== undefined && availability === 'unknown') warnings.push('unknown_availability')
  return { kind: 'priced', offer: { observedCents, currency, regularCents, availability, warnings } }
}

function summarizeAggregate(aggregate: JsonRecord): AggregatePriceInfo {
  const low = parseJsonLdPrice(aggregate.lowPrice)
  const high = parseJsonLdPrice(aggregate.highPrice)
  const count = aggregate.offerCount
  const offerCount = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? count
    : typeof count === 'string' && /^\d{1,9}$/.test(count) ? Number(count) : null
  return {
    lowCents: low.kind === 'value' ? low.cents : null,
    highCents: high.kind === 'value' ? high.cents : null,
    currency: currencyKey(aggregate.priceCurrency),
    offerCount,
  }
}

const EMPTY_AGGREGATE: AggregatePriceInfo = { lowCents: null, highCents: null, currency: null, offerCount: null }

type ProductResult =
  | { kind: 'no_offers' }
  | { kind: 'failure'; code: ParseFailureCode; aggregate?: AggregatePriceInfo }
  | { kind: 'priced'; metadata: ProductMetadata; observation: NormalizedObservation; aggregate: AggregatePriceInfo | null; warnings: ParseWarningCode[] }

function evaluateProduct(product: JsonRecord, ids: IdIndex): ProductResult {
  const entries = resolveList(product.offers, ids)
  if (entries.length === 0) return { kind: 'no_offers' }

  const offers = new Set<JsonRecord>()
  const aggregates = new Set<JsonRecord>()
  for (const entry of entries) {
    if (entry === DUPLICATE_ID) return { kind: 'failure', code: 'ambiguous_offers' }
    if (hasType(entry, 'aggregateoffer')) {
      aggregates.add(entry)
      for (const nested of resolveList(entry.offers, ids)) {
        if (nested === DUPLICATE_ID) return { kind: 'failure', code: 'ambiguous_offers' }
        if (hasType(nested, 'aggregateoffer')) aggregates.add(nested)
        else if (hasType(nested, 'offer') || nested['@type'] === undefined) offers.add(nested)
      }
    } else if (hasType(entry, 'offer') || entry['@type'] === undefined) {
      offers.add(entry)
    }
  }

  const results = [...offers].map((offer) => evaluateOffer(offer, ids, product.availability))
  const failures = results.flatMap((result) => (result.kind === 'failure' ? [result.code] : []))
  if (failures.length > 0) return { kind: 'failure', code: strongestFailure(failures) }
  const priced = results.flatMap((result) => (result.kind === 'priced' ? [result.offer] : []))
  const warnings = results.flatMap((result) => (result.kind === 'failure' ? [] : result.kind === 'priced' ? result.offer.warnings : result.warnings))

  const summaries = [...aggregates].map(summarizeAggregate)
  const distinctSummaries = new Set(summaries.map((summary) => JSON.stringify(summary)))
  const aggregate = summaries.length === 0 ? null : distinctSummaries.size === 1 ? summaries[0] : EMPTY_AGGREGATE

  if (priced.length === 0) {
    if (aggregate) return { kind: 'failure', code: 'aggregate_offer_only', aggregate }
    return { kind: 'failure', code: results.some((result) => result.kind === 'ignored' && result.reason === 'unpriced') ? 'no_price' : 'no_offer' }
  }

  const currencies = new Set(priced.map((offer) => offer.currency))
  if (currencies.size > 1) return { kind: 'failure', code: 'conflicting_currencies' }
  const observedSet = new Set(priced.map((offer) => offer.observedCents))
  if (observedSet.size > 1) return { kind: 'failure', code: 'ambiguous_offers' }
  const observedCents = [...observedSet][0]
  const currency = [...currencies][0]

  if (aggregate) {
    if (distinctSummaries.size > 1) return { kind: 'failure', code: 'ambiguous_offers' }
    if (aggregate.currency !== null && aggregate.currency !== currency) return { kind: 'failure', code: 'conflicting_currencies' }
    if ((aggregate.lowCents !== null && observedCents < aggregate.lowCents) || (aggregate.highCents !== null && observedCents > aggregate.highCents)) {
      return { kind: 'failure', code: 'ambiguous_offers' }
    }
    warnings.push('aggregate_offer_ignored')
  }

  const regulars = new Set(priced.map((offer) => offer.regularCents))
  let regularCents: number | null = null
  if (regulars.size === 1) regularCents = [...regulars][0]
  else warnings.push('conflicting_reference_prices')

  const availabilities = new Set(priced.map((offer) => offer.availability))
  const availability = availabilities.size === 1 ? [...availabilities][0] : 'unknown'
  if (availabilities.size > 1) warnings.push('conflicting_availability')
  if (priced.length > 1) warnings.push('duplicate_offers_collapsed')

  const normalized = normalizeObservation({
    observedPrice: centsToMoneyString(observedCents),
    regularPrice: regularCents === null ? null : centsToMoneyString(regularCents),
    salePrice: regularCents !== null && regularCents > observedCents ? centsToMoneyString(observedCents) : null,
    currency,
    availability,
  })
  if (!normalized.ok) return { kind: 'failure', code: normalized.code }

  const metadata = productMetadata(product)
  return { kind: 'priced', metadata, observation: normalized.value, aggregate, warnings: [...warnings, ...metadata.warnings] }
}

// --- product selection ------------------------------------------------------------------

function productCandidates(nodes: readonly JsonRecord[], ids: IdIndex): JsonRecord[] {
  const candidates = new Set<JsonRecord>()
  for (const node of nodes) {
    if (hasType(node, 'product')) candidates.add(node)
  }
  // A page may declare its main entity explicitly; nested related/variant products elsewhere
  // (isRelatedTo, hasVariant, itemListElement…) are intentionally not candidates.
  for (const node of nodes) {
    if (hasType(node, 'product') || node.mainEntity === undefined) continue
    for (const entity of resolveList(node.mainEntity, ids)) {
      if (entity === DUPLICATE_ID) throw new ParseStop('ambiguous_product')
      if (hasType(entity, 'product')) candidates.add(entity)
    }
  }
  return [...candidates]
}

function uniqueOrNull<T>(values: readonly (T | null)[]): T | null {
  const present = new Set(values.filter((value): value is T => value !== null))
  return present.size === 1 ? [...present][0] : null
}

/** Several usable Product nodes collapse only when provably the same entity with the same price state. */
function collapseEquivalent(priced: Array<Extract<ProductResult, { kind: 'priced' }>>): Extract<ProductResult, { kind: 'priced' }> | null {
  const hashes = new Set(priced.map((item) => observationStateHash(item.observation)))
  if (hashes.size !== 1) return null
  const ids = priced.map((item) => item.metadata.entityId)
  const gtins = priced.map((item) => item.metadata.ean?.padStart(14, '0') ?? null)
  const sameId = ids.every((id) => id !== null && id === ids[0])
  const sameGtin = gtins.every((gtin) => gtin !== null && gtin === gtins[0])
  if (!sameId && !sameGtin) return null
  if (new Set(gtins.filter((gtin) => gtin !== null)).size > 1) return null
  const skus = priced.map((item) => normalizeSku(item.metadata.manufacturerSku)).filter((sku): sku is string => sku !== null)
  if (new Set(skus).size > 1) return null
  const aggregates = new Set(priced.map((item) => JSON.stringify(item.aggregate)))
  if (aggregates.size > 1) return null

  const pick = <K extends keyof ProductMetadata>(key: K) => uniqueOrNull(priced.map((item) => item.metadata[key] as ProductMetadata[K] | null))
  const metadata: ProductMetadata = {
    entityId: pick('entityId'),
    sourceProductId: pick('sourceProductId'),
    title: pick('title'),
    brand: pick('brand'),
    ean: pick('ean'),
    manufacturerSku: pick('manufacturerSku'),
    sizeText: pick('sizeText'),
    warnings: [],
  }
  return {
    kind: 'priced',
    metadata,
    observation: priced[0].observation,
    aggregate: priced[0].aggregate,
    warnings: [...priced.flatMap((item) => item.warnings), 'equivalent_products_collapsed'],
  }
}

function selectProduct(nodes: readonly JsonRecord[], ids: IdIndex): ProductResult & { extraWarnings: ParseWarningCode[] } | ParseFailure {
  const candidates = productCandidates(nodes, ids)
  if (candidates.length === 0) return failure('no_product')
  const results = candidates.map((product) => evaluateProduct(product, ids))
  const plausible = results.filter((result) => result.kind !== 'no_offers')
  const extraWarnings: ParseWarningCode[] = plausible.length < results.length ? ['product_without_offers_ignored'] : []
  if (plausible.length === 0) return failure('no_offer')
  if (plausible.length === 1) return { ...plausible[0], extraWarnings }

  // Strict policy: with several Products carrying offers, every one must be usable and
  // provably the same entity; an unusable one could be the page's real product.
  const priced = plausible.filter((result): result is Extract<ProductResult, { kind: 'priced' }> => result.kind === 'priced')
  if (priced.length !== plausible.length) return failure('ambiguous_product')
  const collapsed = collapseEquivalent(priced)
  return collapsed ? { ...collapsed, extraWarnings } : failure('ambiguous_product')
}

export const jsonLdProductAdapter: CompetitorAdapter = {
  key: 'jsonld-product',
  parse(html, url) {
    const extracted = extractJsonLdBlocks(html)
    if (!extracted.ok) return extracted
    const nodes = collectNodes(extracted.blocks)
    if (!Array.isArray(nodes)) return nodes

    try {
      const ids = buildIdIndex(nodes)
      const selected = selectProduct(nodes, ids)
      if ('ok' in selected) return selected
      if (selected.kind === 'failure') return failure(selected.code, selected.aggregate)
      if (selected.kind !== 'priced') return failure('no_offer')

      const { entityId: _entityId, warnings: _metadataWarnings, ...metadata } = selected.metadata
      const listing: ParsedListing = {
        ok: true,
        url,
        ...metadata,
        observation: selected.observation,
        aggregate: selected.aggregate,
        warnings: [...new Set([...selected.warnings, ...selected.extraWarnings])].sort(),
      }
      return listing
    } catch (error) {
      if (error instanceof ParseStop) return failure(error.code, error.aggregate)
      throw error
    }
  },
}
