import type { CompetitorAdapterKey } from '../constants'
import type { NormalizedObservation, ObservationFailureCode } from '../observation'

export type ParsedListing = {
  ok: true
  url: string
  sourceProductId: string | null
  title: string | null
  brand: string | null
  ean: string | null
  manufacturerSku: string | null
  sizeText: string | null
  observation: NormalizedObservation
}

export type ParseFailureCode =
  | ObservationFailureCode
  | 'no_jsonld'
  | 'too_many_jsonld_blocks'
  | 'jsonld_block_too_large'
  | 'jsonld_total_too_large'
  | 'invalid_jsonld'
  | 'jsonld_too_complex'
  | 'no_product'
  | 'no_offer'

export type ParseFailure = {
  ok: false
  code: ParseFailureCode
}

export type AdapterParseResult = ParsedListing | ParseFailure

export interface CompetitorAdapter {
  readonly key: CompetitorAdapterKey
  parse(html: string, url: string): AdapterParseResult
}
