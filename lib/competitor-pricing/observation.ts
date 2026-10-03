import { createHash } from 'node:crypto'
import { AVAILABILITIES, SUPPORTED_CURRENCIES, isOneOf, type Availability, type SupportedCurrency } from './constants'
import { MoneyError, centsToMoneyString, isPositiveCents, moneyToCents } from './money'

// Normalized competitor price observation. A parse failure is NOT an observation:
// normalizeObservation returns { ok: false } and the caller records a run error.
// There is no code path that turns a missing/invalid price into 0.

export type RawObservation = {
  regularPrice?: string | null
  salePrice?: string | null
  currency?: string | null
  availability?: string | null
}

export type NormalizedObservation = {
  regularCents: number | null
  saleCents: number | null
  currency: SupportedCurrency
  availability: Availability
}

export type ObservationFailureCode =
  | 'no_price'
  | 'invalid_price'
  | 'non_positive_price'
  | 'unsupported_currency'
  | 'sale_above_regular'

export type NormalizeResult =
  | { ok: true; value: NormalizedObservation }
  | { ok: false; code: ObservationFailureCode }

function parsePrice(value: string | null | undefined): { cents: number | null } | { error: ObservationFailureCode } {
  if (value === null || value === undefined || value.trim() === '') return { cents: null }
  // Adapters must hand over a plain decimal string ("18.90"); locale parsing belongs to the adapter.
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim())) return { error: 'invalid_price' }
  try {
    const cents = moneyToCents(value.trim())
    return isPositiveCents(cents) ? { cents } : { error: 'non_positive_price' }
  } catch (error) {
    if (error instanceof MoneyError) return { error: 'invalid_price' }
    throw error
  }
}

export function normalizeObservation(raw: RawObservation): NormalizeResult {
  const regular = parsePrice(raw.regularPrice)
  if ('error' in regular) return { ok: false, code: regular.error }
  const sale = parsePrice(raw.salePrice)
  if ('error' in sale) return { ok: false, code: sale.error }
  if (regular.cents === null && sale.cents === null) return { ok: false, code: 'no_price' }

  const currency = raw.currency?.trim().toUpperCase()
  if (!isOneOf(SUPPORTED_CURRENCIES, currency)) return { ok: false, code: 'unsupported_currency' }

  let saleCents = sale.cents
  if (regular.cents !== null && saleCents !== null) {
    if (saleCents > regular.cents) return { ok: false, code: 'sale_above_regular' }
    // "Sale" equal to the regular price is not a discount.
    if (saleCents === regular.cents) saleCents = null
  }

  const availability = isOneOf(AVAILABILITIES, raw.availability) ? raw.availability : 'unknown'
  return { ok: true, value: { regularCents: regular.cents, saleCents, currency, availability } }
}

/** Deterministic fingerprint of the observable state; equal hash ⇒ same observation state. */
export function observationStateHash(observation: NormalizedObservation): string {
  const canonical = [
    observation.regularCents === null ? '-' : centsToMoneyString(observation.regularCents),
    observation.saleCents === null ? '-' : centsToMoneyString(observation.saleCents),
    observation.currency,
    observation.availability,
  ].join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Change-only history: append a new row only when the state differs from the latest
 * stored row; otherwise the latest row's lastSeenAt/seenCount are refreshed.
 * A→B→A correctly yields three rows.
 */
export function observationWriteAction(latestStateHash: string | null | undefined, nextStateHash: string): 'append' | 'touch' {
  return latestStateHash === nextStateHash ? 'touch' : 'append'
}
