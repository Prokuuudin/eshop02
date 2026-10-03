import type { CompetitorAdapterKey } from '../constants'
import type { NormalizedObservation, ObservationFailureCode } from '../observation'

// Adapter boundary: HTML in → structured, Prisma-free result out. Adapters never fetch,
// never touch the database and never compute recommendations. URLs found inside JSON-LD
// are metadata only: any future request must go through safe-fetch again.

/**
 * Diagnostic summary of an AggregateOffer. A range summarises several offers; it is never
 * an observed product price and never becomes recommendation evidence.
 */
export type AggregatePriceInfo = {
  lowCents: number | null
  highCents: number | null
  currency: string | null
  offerCount: number | null
}

/** Non-fatal, machine-readable parser notes (sorted, unique). */
export const PARSE_WARNING_CODES = [
  'aggregate_offer_ignored',
  'conflicting_availability',
  'conflicting_identifiers',
  'conflicting_reference_prices',
  'duplicate_offers_collapsed',
  'equivalent_products_collapsed',
  'malformed_identifier',
  'missing_gtin',
  'missing_sku',
  'non_new_condition_offer_ignored',
  'offer_without_price_ignored',
  'product_without_offers_ignored',
  'reference_price_ignored',
  'unknown_availability',
  'unsupported_price_specification_ignored',
] as const
export type ParseWarningCode = (typeof PARSE_WARNING_CODES)[number]

export type ParsedListing = {
  ok: true
  url: string
  sourceProductId: string | null
  title: string | null
  brand: string | null
  /** Check-digit-valid GTIN only (leading zeros preserved); malformed values are dropped with a warning. */
  ean: string | null
  manufacturerSku: string | null
  sizeText: string | null
  /** observedCents is always set; regular/sale only with literal schema.org semantics. */
  observation: NormalizedObservation
  aggregate: AggregatePriceInfo | null
  warnings: ParseWarningCode[]
}

export const JSONLD_LIMIT_FAILURE_CODES = [
  'too_many_jsonld_blocks',
  'jsonld_block_too_large',
  'jsonld_total_too_large',
  'jsonld_too_complex',
] as const

export type ParseFailureCode =
  | ObservationFailureCode
  | (typeof JSONLD_LIMIT_FAILURE_CODES)[number]
  | 'no_jsonld'
  | 'invalid_jsonld'
  | 'no_product'
  | 'ambiguous_product'
  | 'no_offer'
  | 'ambiguous_offers'
  | 'conflicting_currencies'
  | 'aggregate_offer_only'

/** Data/markup problems: never a reason to mark the source as blocked. */
export type ParseFailure = {
  ok: false
  code: ParseFailureCode
  /** Present for aggregate_offer_only so the diagnosis is not lost. */
  aggregate?: AggregatePriceInfo
}

export type AdapterParseResult = ParsedListing | ParseFailure

export interface CompetitorAdapter {
  readonly key: CompetitorAdapterKey
  parse(html: string, url: string): AdapterParseResult
}
