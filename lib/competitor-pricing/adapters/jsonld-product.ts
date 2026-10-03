import { Buffer } from 'node:buffer'
import { normalizeObservation, type ObservationFailureCode } from '../observation'
import type { CompetitorAdapter, ParseFailure, ParsedListing } from './types'

export const MAX_JSON_LD_BLOCKS = 32
export const MAX_JSON_LD_BLOCK_BYTES = 256 * 1024
export const MAX_JSON_LD_TOTAL_BYTES = 512 * 1024
export const MAX_JSON_LD_NODES = 10_000

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const TYPE_ATTRIBUTE_PATTERN = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i

type JsonRecord = Record<string, unknown>

type PriceCandidate = {
  price: unknown
  currency: unknown
  availability: unknown
}

type PriceNormalization =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: string }

type JsonDocument = {
  nodes: JsonRecord[]
  malformedBlocks: number
}

function failure(code: ParseFailure['code']): ParseFailure {
  return { ok: false, code }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mediaType(attributes: string): string | null {
  const match = TYPE_ATTRIBUTE_PATTERN.exec(attributes)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value ? value.split(';', 1)[0].trim().toLowerCase() : null
}

function extractJsonLdBlocks(html: string): { ok: true; blocks: string[] } | ParseFailure {
  const blocks: string[] = []
  let totalBytes = 0

  SCRIPT_PATTERN.lastIndex = 0
  for (let match = SCRIPT_PATTERN.exec(html); match; match = SCRIPT_PATTERN.exec(html)) {
    if (mediaType(match[1] ?? '') !== 'application/ld+json') continue
    if (blocks.length >= MAX_JSON_LD_BLOCKS) return failure('too_many_jsonld_blocks')

    const rawBlock = match[2] ?? ''
    const bytes = Buffer.byteLength(rawBlock, 'utf8')
    if (bytes > MAX_JSON_LD_BLOCK_BYTES) return failure('jsonld_block_too_large')
    totalBytes += bytes
    if (totalBytes > MAX_JSON_LD_TOTAL_BYTES) return failure('jsonld_total_too_large')
    blocks.push(rawBlock.replace(/^\uFEFF/, '').trim())
  }

  return blocks.length === 0 ? failure('no_jsonld') : { ok: true, blocks }
}

function collectNodes(value: unknown, nodes: JsonRecord[]): boolean {
  const pending: unknown[] = [value]
  const seen = new Set<object>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (Array.isArray(current)) {
      if (seen.has(current)) continue
      seen.add(current)
      for (let index = current.length - 1; index >= 0; index -= 1) pending.push(current[index])
      continue
    }
    if (!isRecord(current) || seen.has(current)) continue
    seen.add(current)
    nodes.push(current)
    if (nodes.length > MAX_JSON_LD_NODES) return false

    // JSON-LD documents commonly group entities under @graph. Other nested objects
    // are traversed only when interpreting a Product or Offer below.
    if ('@graph' in current) pending.push(current['@graph'])
  }

  return true
}

function parseDocuments(blocks: string[]): JsonDocument | ParseFailure {
  const nodes: JsonRecord[] = []
  let malformedBlocks = 0

  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block)
      if (!collectNodes(parsed, nodes)) return failure('jsonld_too_complex')
    } catch {
      malformedBlocks += 1
    }
  }

  return { nodes, malformedBlocks }
}

function typeName(value: string): string {
  const withoutFragment = value.split('#').at(-1) ?? value
  return (withoutFragment.split('/').at(-1) ?? withoutFragment).toLowerCase()
}

function hasType(record: JsonRecord, expected: string): boolean {
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
  return types.some((value) => typeof value === 'string' && typeName(value) === expected.toLowerCase())
}

function cleanText(value: unknown, maxLength = 1_000): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength)
}

function textFromValue(value: unknown, maxLength?: number): string | null {
  const direct = cleanText(value, maxLength)
  if (direct) return direct
  if (!isRecord(value)) return null
  return cleanText(value.name ?? value.value, maxLength)
}

function firstText(record: JsonRecord, fields: readonly string[], maxLength?: number): string | null {
  for (const field of fields) {
    const value = textFromValue(record[field], maxLength)
    if (value) return value
  }
  return null
}

function normalizeIdentifier(value: unknown): string | null {
  const identifier = textFromValue(value, Number.MAX_SAFE_INTEGER)
  return identifier && identifier.length <= 200 ? identifier : null
}

function firstIdentifier(record: JsonRecord, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = normalizeIdentifier(record[field])
    if (value) return value
  }
  return null
}

function normalizeIntegerPart(value: string, groupingSeparator: string | null): string | null {
  if (!groupingSeparator) return /^\d+$/.test(value) ? value : null
  const parts = value.split(groupingSeparator)
  if (!parts[0] || !/^\d{1,3}$/.test(parts[0])) return null
  if (parts.slice(1).some((part) => !/^\d{3}$/.test(part))) return null
  return parts.join('')
}

/** Convert common JSON-LD locale formats to the strict decimal form expected by normalizeObservation. */
export function normalizeJsonLdPrice(value: unknown): PriceNormalization {
  if (value === null || value === undefined || value === '') return { kind: 'missing' }
  if (typeof value !== 'string' && typeof value !== 'number') return { kind: 'invalid' }
  if (typeof value === 'number' && !Number.isFinite(value)) return { kind: 'invalid' }

  let input = String(value).trim()
  if (!input) return { kind: 'missing' }
  input = input
    .replace(/^(?:EUR\s*|€\s*)/i, '')
    .replace(/(?:\s*EUR|\s*€)$/i, '')
    .replace(/[\s\u00a0\u202f']/g, '')

  const sign = input.startsWith('-') ? '-' : input.startsWith('+') ? '+' : ''
  if (sign) input = input.slice(1)
  if (!input || /[^\d.,]/.test(input)) return { kind: 'invalid' }

  const dotCount = (input.match(/\./g) ?? []).length
  const commaCount = (input.match(/,/g) ?? []).length
  let decimalSeparator: '.' | ',' | null = null
  let groupingSeparator: '.' | ',' | null = null

  if (dotCount > 0 && commaCount > 0) {
    decimalSeparator = input.lastIndexOf('.') > input.lastIndexOf(',') ? '.' : ','
    groupingSeparator = decimalSeparator === '.' ? ',' : '.'
    if ((decimalSeparator === '.' ? dotCount : commaCount) !== 1) return { kind: 'invalid' }
  } else if (dotCount > 0 || commaCount > 0) {
    const separator: '.' | ',' = dotCount > 0 ? '.' : ','
    const count = dotCount + commaCount
    const trailingDigits = input.length - input.lastIndexOf(separator) - 1
    if (count === 1 && trailingDigits <= 2) decimalSeparator = separator
    else groupingSeparator = separator
  }

  const decimalParts = decimalSeparator ? input.split(decimalSeparator) : [input]
  if (decimalParts.length !== 1 && decimalParts.length !== 2) return { kind: 'invalid' }
  const integerPart = normalizeIntegerPart(decimalParts[0] ?? '', groupingSeparator)
  const fraction = decimalParts[1] ?? ''
  if (integerPart === null || (decimalSeparator && !/^\d{1,2}$/.test(fraction))) return { kind: 'invalid' }

  const normalizedFraction = fraction.padEnd(2, '0') || '00'
  return { kind: 'value', value: `${sign}${integerPart}.${normalizedFraction}` }
}

function availabilityFromSchema(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'
  switch (typeName(value)) {
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

function valuesAsRecords(value: unknown, idIndex: ReadonlyMap<string, JsonRecord>): JsonRecord[] {
  const values = Array.isArray(value) ? value : [value]
  const records: JsonRecord[] = []
  for (const entry of values) {
    if (!isRecord(entry)) continue
    const id = typeof entry['@id'] === 'string' ? entry['@id'] : null
    records.push(id && idIndex.has(id) ? (idIndex.get(id) as JsonRecord) : entry)
  }
  return records
}

function priceSpecifications(offer: JsonRecord, idIndex: ReadonlyMap<string, JsonRecord>): JsonRecord[] {
  return valuesAsRecords(offer.priceSpecification, idIndex)
}

function offerCandidates(
  offer: JsonRecord,
  idIndex: ReadonlyMap<string, JsonRecord>,
  fallbackAvailability: unknown,
  seen = new Set<JsonRecord>(),
): PriceCandidate[] {
  if (seen.has(offer)) return []
  seen.add(offer)

  const candidates: PriceCandidate[] = []
  const specifications = priceSpecifications(offer, idIndex)
  const specificationCurrency = specifications.map((item) => item.priceCurrency).find((value) => value !== undefined)
  const currency = offer.priceCurrency ?? specificationCurrency
  const availability = offer.availability ?? fallbackAvailability

  if (hasType(offer, 'aggregateoffer')) {
    candidates.push({ price: offer.lowPrice ?? offer.price ?? offer.highPrice, currency, availability })
    for (const nested of valuesAsRecords(offer.offers, idIndex)) {
      if (hasType(nested, 'offer') || hasType(nested, 'aggregateoffer')) {
        candidates.push(...offerCandidates(nested, idIndex, availability, seen))
      }
    }
  } else {
    candidates.push({ price: offer.price, currency, availability })
  }

  for (const specification of specifications) {
    candidates.push({
      price: specification.price,
      currency: specification.priceCurrency ?? offer.priceCurrency,
      availability,
    })
  }

  return candidates
}

function observationFromCandidate(candidate: PriceCandidate): ParsedListing['observation'] | ParseFailure {
  const price = normalizeJsonLdPrice(candidate.price)
  if (price.kind === 'missing') return failure('no_price')
  if (price.kind === 'invalid') return failure('invalid_price')

  const normalized = normalizeObservation({
    regularPrice: price.value,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
    availability: availabilityFromSchema(candidate.availability),
  })
  return normalized.ok ? normalized.value : failure(normalized.code)
}

function metadata(product: JsonRecord, url: string, observation: ParsedListing['observation']): ParsedListing {
  return {
    ok: true,
    url,
    sourceProductId: firstIdentifier(product, ['productID', '@id']),
    title: firstText(product, ['name'], 1_000),
    brand: firstText(product, ['brand'], 300),
    ean: firstIdentifier(product, ['gtin13', 'gtin14', 'gtin12', 'gtin8', 'gtin']),
    manufacturerSku: firstIdentifier(product, ['sku', 'mpn']),
    sizeText: firstText(product, ['size'], 300),
    observation,
  }
}

function firstFailureCode(current: ObservationFailureCode | 'no_price' | null, next: ParseFailure['code']): ObservationFailureCode | 'no_price' {
  if (current && current !== 'no_price') return current
  if (next === 'invalid_price' || next === 'non_positive_price' || next === 'unsupported_currency' || next === 'sale_above_regular') return next
  if (current) return current
  return 'no_price'
}

export const jsonLdProductAdapter: CompetitorAdapter = {
  key: 'jsonld-product',
  parse(html, url) {
    const extracted = extractJsonLdBlocks(html)
    if (!extracted.ok) return extracted

    const document = parseDocuments(extracted.blocks)
    if ('code' in document) return document

    const products = document.nodes.filter((node) => hasType(node, 'product'))
    if (products.length === 0) return failure(document.malformedBlocks > 0 && document.nodes.length === 0 ? 'invalid_jsonld' : 'no_product')

    const idIndex = new Map<string, JsonRecord>()
    for (const node of document.nodes) {
      if (typeof node['@id'] === 'string') idIndex.set(node['@id'], node)
    }

    let sawOffer = false
    let firstPriceFailure: ObservationFailureCode | 'no_price' | null = null
    for (const product of products) {
      const offers = valuesAsRecords(product.offers, idIndex).filter((offer) => hasType(offer, 'offer') || hasType(offer, 'aggregateoffer'))
      if (offers.length === 0) continue
      sawOffer = true

      for (const offer of offers) {
        for (const candidate of offerCandidates(offer, idIndex, product.availability)) {
          const observation = observationFromCandidate(candidate)
          if (!('ok' in observation)) return metadata(product, url, observation)
          firstPriceFailure = firstFailureCode(firstPriceFailure, observation.code)
        }
      }
    }

    return failure(sawOffer ? (firstPriceFailure ?? 'no_price') : 'no_offer')
  },
}
