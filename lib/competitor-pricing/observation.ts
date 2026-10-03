import { createHash } from 'node:crypto'
import { AVAILABILITIES, SUPPORTED_CURRENCIES, isOneOf, type Availability, type SupportedCurrency } from './constants'
import { MAX_MONEY_CENTS, centsToMoneyString } from './integer-money'

// Normalized competitor price observation. A parse failure is NOT an observation:
// normalizeObservation returns { ok: false } and the caller records a run error.
// There is no code path that turns a missing/invalid price into 0.
//
// observedPrice = the current effective price the source unambiguously publishes now.
// It is NOT automatically a regular/list price, a sale price or an aggregate low price.
// regularPrice/salePrice carry only literal, proven semantics:
//   - sale set     ⇒ sale = observed, regular set and regular > sale
//   - sale missing ⇒ regular missing or regular = observed

export type RawObservation = {
  observedPrice?: string | null
  regularPrice?: string | null
  salePrice?: string | null
  currency?: string | null
  availability?: string | null
}

export type NormalizedObservation = {
  observedCents: number
  regularCents: number | null
  saleCents: number | null
  currency: SupportedCurrency
  availability: Availability
}

export type ObservationFailureCode =
  | 'no_price'
  | 'invalid_price'
  | 'non_positive_price'
  | 'missing_currency'
  | 'unsupported_currency'
  | 'inconsistent_price_semantics'

export type NormalizeResult =
  | { ok: true; value: NormalizedObservation }
  | { ok: false; code: ObservationFailureCode }

const STRICT_DECIMAL = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/

/** Exact integer cents from a strict decimal string; pure integer math (no float, no Prisma). */
function strictDecimalToCents(match: RegExpExecArray): number | null {
  const [, sign, integerPart, fraction = ''] = match
  if (integerPart.length > 10) return null
  const cents = Number(integerPart) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) return null
  return sign === '-' ? -cents : cents
}

function parsePrice(value: string | null | undefined): { cents: number | null } | { error: ObservationFailureCode } {
  if (value === null || value === undefined) return { cents: null }
  // Adapters hand over a canonical machine decimal ("18.90"); no trimming, no locale parsing here.
  const match = STRICT_DECIMAL.exec(value)
  if (!match) return { error: value.trim() === '' ? 'no_price' : 'invalid_price' }
  const cents = strictDecimalToCents(match)
  if (cents === null) return { error: 'invalid_price' }
  return cents > 0 ? { cents } : { error: 'non_positive_price' }
}

/** Strict machine decimal → integer cents (shared with adapters so there is one price grammar). */
export function parseStrictPriceString(value: string): { cents: number | null } | { error: ObservationFailureCode } {
  return parsePrice(value)
}

export function normalizeObservation(raw: RawObservation): NormalizeResult {
  const observed = parsePrice(raw.observedPrice)
  if ('error' in observed) return { ok: false, code: observed.error }
  if (observed.cents === null) return { ok: false, code: 'no_price' }
  const regular = parsePrice(raw.regularPrice)
  if ('error' in regular) return { ok: false, code: regular.error }
  const sale = parsePrice(raw.salePrice)
  if ('error' in sale) return { ok: false, code: sale.error }

  const currencyText = typeof raw.currency === 'string' ? raw.currency.trim() : ''
  if (!currencyText) return { ok: false, code: 'missing_currency' }
  const currency = currencyText.toUpperCase()
  if (!isOneOf(SUPPORTED_CURRENCIES, currency)) return { ok: false, code: 'unsupported_currency' }

  if (sale.cents !== null) {
    if (sale.cents !== observed.cents || regular.cents === null || regular.cents <= sale.cents) {
      return { ok: false, code: 'inconsistent_price_semantics' }
    }
  } else if (regular.cents !== null && regular.cents !== observed.cents) {
    return { ok: false, code: 'inconsistent_price_semantics' }
  }

  const availability = isOneOf(AVAILABILITIES, raw.availability) ? raw.availability : 'unknown'
  return {
    ok: true,
    value: { observedCents: observed.cents, regularCents: regular.cents, saleCents: sale.cents, currency, availability },
  }
}

/** Deterministic fingerprint of the observable state; equal hash ⇒ same observation state. */
export function observationStateHash(observation: NormalizedObservation): string {
  const canonical = [
    'v2',
    centsToMoneyString(observation.observedCents),
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
