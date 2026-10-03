import type { MatchMethod, MatchStatus } from './constants'
import type { ParsedListing } from './adapters/types'
import {
  normalizeBrand,
  normalizeGtin,
  normalizeSku,
  normalizeTitle,
  resolveSize,
  titleDiceSimilarity,
  type NormalizedGtin,
  type NormalizedSize,
  type NormalizedTitle,
} from './matching-normalization'

export type ProductMatchCandidate = {
  id: string
  barcode: string | null
  sku: string | null
  title: string
  brand: string
  specVolume?: string | null
  category?: string | null
  externalId?: string | null
  manufacturerName?: string | null
  packagingSize?: number | null
  unitOfMeasure?: string | null
}

export type ExistingMatch = {
  productId: string
  status: MatchStatus
  evidenceKey?: string | null
}

export type RejectedCandidate = {
  productId: string
  /** null is a legacy rejection and remains excluded until an admin explicitly clears it. */
  evidenceKey: string | null
}

export type MatchEvidence = 'gtin_exact' | 'sku_exact' | 'brand_exact' | 'title_exact' | 'title_similar' | 'size_exact'

export type MatchConflict =
  | 'brand_mismatch'
  | 'size_mismatch'
  | 'size_ambiguous'
  | 'product_kind_mismatch'
  | 'numeric_identity_mismatch'
  | 'refill_mismatch'
  | 'set_mismatch'
  | 'gender_mismatch'

export type MatchReason =
  | 'existing_trusted_match'
  | 'unique_gtin_exact'
  | 'duplicate_gtin'
  | 'unique_sku_brand_exact'
  | 'duplicate_sku'
  | 'conflicting_evidence'
  | 'sku_requires_compatible_brand'
  | 'brand_title_size_exact'
  | 'weak_candidates_only'
  | 'no_candidate_evidence'
  | 'all_candidates_rejected'

export type NormalizedListingIdentity = {
  gtin: NormalizedGtin
  sku: string | null
  brand: string | null
  title: NormalizedTitle
  size: NormalizedSize
  evidenceKey: string
}

export type CandidateEvaluation = {
  productId: string
  /** Fingerprint of both competitor identity and this Product's normalized identity. */
  evidenceKey: string
  method: Exclude<MatchMethod, 'manual'> | null
  baseConfidence: number
  evidence: MatchEvidence[]
  conflicts: MatchConflict[]
  titleSimilarity: number
  normalized: {
    gtin: NormalizedGtin
    sku: string | null
    brand: string | null
    title: NormalizedTitle
    size: NormalizedSize
  }
}

export type MatchResult = {
  result: 'protected' | 'likely' | 'ambiguous' | 'no_match'
  proposedStatus: Extract<MatchStatus, 'likely' | 'ambiguous'> | null
  candidateProductId: string | null
  method: Exclude<MatchMethod, 'manual'> | null
  confidence: number | null
  reasons: MatchReason[]
  conflictingEvidence: Array<{ productId: string; conflicts: MatchConflict[] }>
  normalized: NormalizedListingIdentity
  candidates: CandidateEvaluation[]
  excludedRejectedProductIds: string[]
  reconsideredRejectedProductIds: string[]
}

export type CandidateGenerationHints = {
  validGtin: string | null
  exactSku: string | null
  exactBrand: string | null
  titleTokens: string[]
  sizeKey: string | null
}

const CONFIDENCE = {
  exactGtin: 0.98,
  skuBrand: 0.9,
  brandTitleSize: 0.78,
  brandTitle: 0.65,
  titleSize: 0.55,
  titleOnly: 0.4,
  titleSimilar: 0.35,
  ambiguousConflict: 0.5,
  ambiguousSku: 0.6,
} as const

function knownSizeKey(size: NormalizedSize): string | null {
  return size.kind === 'known' ? size.key : null
}

function stableEvidenceKey(input: Omit<NormalizedListingIdentity, 'evidenceKey'>): string {
  return JSON.stringify({
    gtin: input.gtin.kind === 'valid_gtin' ? input.gtin.value : null,
    sku: input.sku,
    brand: input.brand,
    title: input.title.tokenKey,
    size: knownSizeKey(input.size),
  })
}

export function normalizeListingIdentity(listing: ParsedListing): NormalizedListingIdentity {
  const normalized = {
    gtin: normalizeGtin(listing.ean),
    sku: normalizeSku(listing.manufacturerSku),
    brand: normalizeBrand(listing.brand),
    title: normalizeTitle(listing.title),
    size: resolveSize(listing.sizeText, listing.title),
  }
  return { ...normalized, evidenceKey: stableEvidenceKey(normalized) }
}

export function candidateGenerationHints(listing: ParsedListing): CandidateGenerationHints {
  const identity = normalizeListingIdentity(listing)
  return {
    validGtin: identity.gtin.kind === 'valid_gtin' ? identity.gtin.value : null,
    exactSku: identity.sku,
    exactBrand: identity.brand,
    titleTokens: [...identity.title.tokens],
    sizeKey: knownSizeKey(identity.size),
  }
}

function arraysDiffer(left: readonly string[], right: readonly string[]): boolean {
  return left.length > 0 && right.length > 0 && (left.length !== right.length || left.some((item, index) => item !== right[index]))
}

function evaluateCandidate(listing: NormalizedListingIdentity, candidate: ProductMatchCandidate): CandidateEvaluation {
  const gtin = normalizeGtin(candidate.barcode)
  const sku = normalizeSku(candidate.sku)
  const brand = normalizeBrand(candidate.brand)
  const title = normalizeTitle(candidate.title)
  const size = resolveSize(candidate.specVolume, candidate.title)
  const titleSimilarity = titleDiceSimilarity(listing.title, title)
  const candidateEvidenceKey = JSON.stringify({
    listing: listing.evidenceKey,
    candidate: {
      gtin: gtin.kind === 'valid_gtin' ? gtin.value : null,
      sku,
      brand,
      title: title.tokenKey,
      size: knownSizeKey(size),
    },
  })
  const evidence: MatchEvidence[] = []
  const conflicts: MatchConflict[] = []

  if (listing.gtin.kind === 'valid_gtin' && gtin.kind === 'valid_gtin' && listing.gtin.value === gtin.value) evidence.push('gtin_exact')
  if (listing.sku && sku && listing.sku === sku) evidence.push('sku_exact')
  if (listing.brand && brand) {
    if (listing.brand === brand) evidence.push('brand_exact')
    else conflicts.push('brand_mismatch')
  }
  if (listing.title.tokenKey && listing.title.tokenKey === title.tokenKey) evidence.push('title_exact')
  else if (titleSimilarity >= 0.6) evidence.push('title_similar')

  if (listing.size.kind === 'ambiguous' || size.kind === 'ambiguous') conflicts.push('size_ambiguous')
  else if (listing.size.kind === 'known' && size.kind === 'known') {
    if (listing.size.key === size.key) evidence.push('size_exact')
    else conflicts.push('size_mismatch')
  }

  if (arraysDiffer(listing.title.productKinds, title.productKinds)) conflicts.push('product_kind_mismatch')
  if (arraysDiffer(listing.title.numericTokens, title.numericTokens)) conflicts.push('numeric_identity_mismatch')
  if (listing.title.hasRefillMarker !== title.hasRefillMarker) conflicts.push('refill_mismatch')
  if (listing.title.hasSetMarker !== title.hasSetMarker) conflicts.push('set_mismatch')
  if (listing.title.gender && title.gender && listing.title.gender !== title.gender) conflicts.push('gender_mismatch')

  let baseConfidence = 0
  let method: CandidateEvaluation['method'] = null
  if (evidence.includes('gtin_exact')) {
    baseConfidence = CONFIDENCE.exactGtin
    method = 'ean'
  } else if (evidence.includes('sku_exact') && evidence.includes('brand_exact')) {
    baseConfidence = CONFIDENCE.skuBrand
    method = 'sku'
  } else if (evidence.includes('brand_exact') && evidence.includes('title_exact') && evidence.includes('size_exact')) {
    baseConfidence = CONFIDENCE.brandTitleSize
    method = 'title'
  } else if (evidence.includes('brand_exact') && evidence.includes('title_exact')) {
    baseConfidence = CONFIDENCE.brandTitle
    method = 'title'
  } else if (evidence.includes('title_exact') && evidence.includes('size_exact')) {
    baseConfidence = CONFIDENCE.titleSize
    method = 'title'
  } else if (evidence.includes('title_exact')) {
    baseConfidence = CONFIDENCE.titleOnly
    method = 'title'
  } else if (evidence.includes('title_similar')) {
    baseConfidence = CONFIDENCE.titleSimilar
    method = 'title'
  } else if (evidence.includes('sku_exact')) {
    baseConfidence = CONFIDENCE.ambiguousSku
    method = 'sku'
  }

  return {
    productId: candidate.id,
    evidenceKey: candidateEvidenceKey,
    method,
    baseConfidence,
    evidence,
    conflicts: [...new Set(conflicts)],
    titleSimilarity,
    normalized: { gtin, sku, brand, title, size },
  }
}

function conflictRows(candidates: CandidateEvaluation[]): MatchResult['conflictingEvidence'] {
  return candidates.filter((candidate) => candidate.conflicts.length > 0).map((candidate) => ({ productId: candidate.productId, conflicts: candidate.conflicts }))
}

function resultBase(normalized: NormalizedListingIdentity, candidates: CandidateEvaluation[], excluded: string[], reconsidered: string[]) {
  return {
    normalized,
    candidates,
    conflictingEvidence: conflictRows(candidates),
    excludedRejectedProductIds: excluded,
    reconsideredRejectedProductIds: reconsidered,
  }
}

export function matchCompetitorProduct(input: {
  listing: ParsedListing
  candidates: readonly ProductMatchCandidate[]
  existingMatch?: ExistingMatch | null
  rejectedCandidates?: readonly RejectedCandidate[]
}): MatchResult {
  const normalized = normalizeListingIdentity(input.listing)
  const existing = input.existingMatch
  if (existing?.status === 'confirmed' || existing?.status === 'manual') {
    return {
      ...resultBase(normalized, [], [], []),
      result: 'protected',
      proposedStatus: null,
      candidateProductId: existing.productId,
      method: null,
      confidence: null,
      reasons: ['existing_trusted_match'],
    }
  }

  const rejections = [...(input.rejectedCandidates ?? [])]
  if (existing?.status === 'rejected') rejections.push({ productId: existing.productId, evidenceKey: existing.evidenceKey ?? null })
  const rejectedByProduct = new Map(rejections.map((rejection) => [rejection.productId, rejection]))
  const excluded: string[] = []
  const reconsidered: string[] = []
  const candidates = input.candidates.map((candidate) => evaluateCandidate(normalized, candidate))
    .filter((candidate) => {
      const rejection = rejectedByProduct.get(candidate.productId)
      if (!rejection) return true
      if (rejection.evidenceKey === null || rejection.evidenceKey === candidate.evidenceKey) {
        excluded.push(candidate.productId)
        return false
      }
      reconsidered.push(candidate.productId)
      return true
    })
    .sort((left, right) => right.baseConfidence - left.baseConfidence || left.productId.localeCompare(right.productId))
  const base = resultBase(normalized, candidates, excluded.sort(), reconsidered.sort())

  const gtinMatches = candidates.filter((candidate) => candidate.evidence.includes('gtin_exact'))
  if (gtinMatches.length > 1) {
    return { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: null, method: 'ean', confidence: CONFIDENCE.ambiguousConflict, reasons: ['duplicate_gtin'] }
  }
  if (gtinMatches.length === 1) {
    const candidate = gtinMatches[0]
    return candidate.conflicts.length > 0
      ? { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: candidate.productId, method: 'ean', confidence: CONFIDENCE.ambiguousConflict, reasons: ['conflicting_evidence'] }
      : { ...base, result: 'likely', proposedStatus: 'likely', candidateProductId: candidate.productId, method: 'ean', confidence: CONFIDENCE.exactGtin, reasons: ['unique_gtin_exact'] }
  }

  const skuMatches = candidates.filter((candidate) => candidate.evidence.includes('sku_exact'))
  if (skuMatches.length > 1) {
    return { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: null, method: 'sku', confidence: CONFIDENCE.ambiguousConflict, reasons: ['duplicate_sku'] }
  }
  if (skuMatches.length === 1) {
    const candidate = skuMatches[0]
    if (candidate.conflicts.length > 0) {
      return { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: candidate.productId, method: 'sku', confidence: CONFIDENCE.ambiguousConflict, reasons: ['conflicting_evidence'] }
    }
    return candidate.evidence.includes('brand_exact')
      ? { ...base, result: 'likely', proposedStatus: 'likely', candidateProductId: candidate.productId, method: 'sku', confidence: CONFIDENCE.skuBrand, reasons: ['unique_sku_brand_exact'] }
      : { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: candidate.productId, method: 'sku', confidence: CONFIDENCE.ambiguousSku, reasons: ['sku_requires_compatible_brand'] }
  }

  const semanticMatches = candidates.filter((candidate) => candidate.evidence.includes('brand_exact') && candidate.evidence.includes('title_exact') && candidate.evidence.includes('size_exact') && candidate.conflicts.length === 0)
  if (semanticMatches.length === 1) {
    return { ...base, result: 'likely', proposedStatus: 'likely', candidateProductId: semanticMatches[0].productId, method: 'title', confidence: CONFIDENCE.brandTitleSize, reasons: ['brand_title_size_exact'] }
  }
  if (semanticMatches.length > 1) {
    return { ...base, result: 'ambiguous', proposedStatus: 'ambiguous', candidateProductId: null, method: 'title', confidence: CONFIDENCE.ambiguousConflict, reasons: ['weak_candidates_only'] }
  }

  const weakCandidates = candidates.filter((candidate) => candidate.baseConfidence > 0)
  if (weakCandidates.length > 0) {
    return {
      ...base,
      result: 'ambiguous',
      proposedStatus: 'ambiguous',
      candidateProductId: null,
      method: weakCandidates[0].method,
      confidence: Math.min(weakCandidates[0].baseConfidence, CONFIDENCE.brandTitle),
      reasons: ['weak_candidates_only'],
    }
  }

  return {
    ...base,
    result: 'no_match',
    proposedStatus: null,
    candidateProductId: null,
    method: null,
    confidence: null,
    reasons: candidates.length === 0 && excluded.length > 0 ? ['all_candidates_rejected'] : ['no_candidate_evidence'],
  }
}
