import type { AdapterParseResult, ParseFailureCode, ParsedListing } from './adapters/types'
import type { CheckStatus } from './constants'
import { observationStateHash, observationWriteAction } from './observation'
import type {
  ObservationIngestionRepository,
  PersistedCompetitorProductState,
  PersistedPriceObservation,
  UpdateCompetitorProductStateCommand,
} from './observation-repository'
import type { SafeFetchErrorCode } from './safe-fetch'

export type ObservationEventContext = {
  /** Server-controlled time when this polling attempt actually ran. */
  checkedAt: Date
  runId?: string | null
}

export type ObservationIngestionAttempt =
  | { kind: 'adapter_result'; result: AdapterParseResult }
  | { kind: 'fetch_failure'; code: SafeFetchErrorCode; retryable: boolean }
  | { kind: 'blocked'; code: SafeFetchErrorCode }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }

export type ObservationRunCounterDelta = {
  productsChecked: number
  observationsCreated: number
  observationsUnchanged: number
  parseFailures: number
  fetchFailures: number
}

const NO_COUNTERS: ObservationRunCounterDelta = {
  productsChecked: 0,
  observationsCreated: 0,
  observationsUnchanged: 0,
  parseFailures: 0,
  fetchFailures: 0,
}

type ObservationSuccessOutcome = {
  kind: 'success'
  action: 'append' | 'touch'
  observation: PersistedPriceObservation
  counters: ObservationRunCounterDelta
}

type ObservationParseFailureOutcome = {
  kind: 'parse_failure'
  code: ParseFailureCode
  counters: ObservationRunCounterDelta
}

type ObservationFetchFailureOutcome = {
  kind: 'fetch_failure'
  code: SafeFetchErrorCode
  retryable: boolean
  counters: ObservationRunCounterDelta
}

type ObservationBlockedOutcome = {
  kind: 'blocked'
  code: SafeFetchErrorCode
  counters: ObservationRunCounterDelta
}

type ObservationRateLimitedOutcome = {
  kind: 'rate_limited'
  retryAfterSeconds?: number
  counters: ObservationRunCounterDelta
}

type ObservationNoOpOutcome = {
  kind: 'no_op'
  reason: 'duplicate_event' | 'stale_event'
  counters: ObservationRunCounterDelta
}

export type ObservationIngestionOutcome =
  | ObservationSuccessOutcome
  | ObservationParseFailureOutcome
  | ObservationFetchFailureOutcome
  | ObservationBlockedOutcome
  | ObservationRateLimitedOutcome
  | ObservationNoOpOutcome

export type IngestObservationInput = {
  competitor: { id: string }
  competitorProduct: { id: string; competitorId: string }
  event: ObservationEventContext
  attempt: ObservationIngestionAttempt
}

export class ObservationIngestionInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ObservationIngestionInvariantError'
  }
}

function counterDelta(values: Partial<ObservationRunCounterDelta>): ObservationRunCounterDelta {
  return { ...NO_COUNTERS, ...values }
}

function assertEventContext(event: ObservationEventContext): void {
  if (!(event.checkedAt instanceof Date) || !Number.isFinite(event.checkedAt.getTime())) {
    throw new ObservationIngestionInvariantError('checkedAt must be a valid server-controlled Date')
  }
  if (event.runId !== undefined && event.runId !== null && event.runId.trim() === '') {
    throw new ObservationIngestionInvariantError('runId must be null or a non-empty string')
  }
}

function assertIdentity(
  input: IngestObservationInput,
  persisted: PersistedCompetitorProductState,
): void {
  if (input.competitorProduct.competitorId !== input.competitor.id) {
    throw new ObservationIngestionInvariantError('CompetitorProduct does not belong to the supplied Competitor')
  }
  if (persisted.id !== input.competitorProduct.id || persisted.competitorId !== input.competitor.id) {
    throw new ObservationIngestionInvariantError('Persisted CompetitorProduct identity does not match the ingestion request')
  }
}

function failureState(
  product: PersistedCompetitorProductState,
  checkedAt: Date,
  lastCheckStatus: CheckStatus,
  lastError: string,
): UpdateCompetitorProductStateCommand {
  return {
    competitorProductId: product.id,
    lastAvailability: product.lastAvailability,
    lastObservedAt: product.lastObservedAt,
    lastCheckAt: checkedAt,
    lastCheckStatus,
    lastError,
    consecutiveFailures: product.consecutiveFailures + 1,
  }
}

function successState(
  product: PersistedCompetitorProductState,
  listing: ParsedListing,
  checkedAt: Date,
): UpdateCompetitorProductStateCommand {
  return {
    competitorProductId: product.id,
    lastAvailability: listing.observation.availability,
    lastObservedAt: checkedAt,
    lastCheckAt: checkedAt,
    lastCheckStatus: 'ok',
    lastError: null,
    consecutiveFailures: 0,
  }
}

/**
 * Persists one completed polling event without importing Prisma or touching a DB.
 * `checkedAt` is the monotonic event key: equality is a replay, an older value is
 * stale, and a real retry after a failed fetch must carry its new attempt time.
 */
export async function ingestObservation(
  repository: ObservationIngestionRepository,
  input: IngestObservationInput,
): Promise<ObservationIngestionOutcome> {
  assertEventContext(input.event)
  if (input.competitorProduct.competitorId !== input.competitor.id) {
    throw new ObservationIngestionInvariantError('CompetitorProduct does not belong to the supplied Competitor')
  }

  return repository.withObservationIngestionTransaction(input.competitorProduct.id, async (transaction) => {
    const snapshot = await transaction.readSnapshot()
    const product = snapshot.competitorProduct
    assertIdentity(input, product)

    const previousCheckMs = product.lastCheckAt?.getTime()
    const checkedAtMs = input.event.checkedAt.getTime()
    if (previousCheckMs !== undefined && checkedAtMs <= previousCheckMs) {
      return {
        kind: 'no_op',
        reason: checkedAtMs === previousCheckMs ? 'duplicate_event' : 'stale_event',
        counters: { ...NO_COUNTERS },
      }
    }

    const runId = input.event.runId ?? null
    const attempt = input.attempt

    if (attempt.kind === 'adapter_result' && !attempt.result.ok) {
      await transaction.updateCompetitorProductState(failureState(product, input.event.checkedAt, 'parse_error', attempt.result.code))
      return {
        kind: 'parse_failure',
        code: attempt.result.code,
        counters: counterDelta({ productsChecked: 1, parseFailures: 1 }),
      }
    }

    if (attempt.kind === 'fetch_failure') {
      const status: CheckStatus = attempt.code === 'not_found' ? 'not_found' : 'fetch_error'
      await transaction.updateCompetitorProductState(failureState(product, input.event.checkedAt, status, attempt.code))
      return {
        kind: 'fetch_failure',
        code: attempt.code,
        retryable: attempt.retryable,
        counters: counterDelta({ productsChecked: 1, fetchFailures: 1 }),
      }
    }

    if (attempt.kind === 'blocked') {
      await transaction.updateCompetitorProductState(failureState(product, input.event.checkedAt, 'blocked', attempt.code))
      return {
        kind: 'blocked',
        code: attempt.code,
        counters: counterDelta({ productsChecked: 1, fetchFailures: 1 }),
      }
    }

    if (attempt.kind === 'rate_limited') {
      await transaction.updateCompetitorProductState(failureState(product, input.event.checkedAt, 'fetch_error', 'rate_limited'))
      return {
        kind: 'rate_limited',
        retryAfterSeconds: attempt.retryAfterSeconds,
        counters: counterDelta({ productsChecked: 1, fetchFailures: 1 }),
      }
    }

    if (attempt.kind !== 'adapter_result' || !attempt.result.ok) {
      throw new ObservationIngestionInvariantError('Unhandled ingestion attempt')
    }
    const listing = attempt.result
    const stateHash = observationStateHash(listing.observation)
    const action = observationWriteAction(snapshot.latestObservation?.stateHash, stateHash)
    let persisted: PersistedPriceObservation

    if (action === 'touch') {
      const latest = snapshot.latestObservation
      if (latest === null) throw new ObservationIngestionInvariantError('Touch requires a latest observation')
      persisted = await transaction.touchLatestObservation({
        observationId: latest.id,
        expectedStateHash: stateHash,
        lastSeenAt: input.event.checkedAt,
        lastRunId: runId,
      })
    } else {
      persisted = await transaction.appendObservation({
        competitorProductId: product.id,
        competitorId: product.competitorId,
        regularCents: listing.observation.regularCents,
        saleCents: listing.observation.saleCents,
        currency: listing.observation.currency,
        availability: listing.observation.availability,
        stateHash,
        observedAt: input.event.checkedAt,
        lastSeenAt: input.event.checkedAt,
        seenCount: 1,
        firstRunId: runId,
        lastRunId: runId,
      })
    }

    await transaction.updateCompetitorProductState(successState(product, listing, input.event.checkedAt))
    return {
      kind: 'success',
      action,
      observation: persisted,
      counters: counterDelta({
        productsChecked: 1,
        observationsCreated: action === 'append' ? 1 : 0,
        observationsUnchanged: action === 'touch' ? 1 : 0,
      }),
    }
  })
}
