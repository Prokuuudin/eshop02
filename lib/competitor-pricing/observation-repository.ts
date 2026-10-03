import type { Availability, CheckStatus, SupportedCurrency } from './constants'

/**
 * Persistence shapes for one observation-ingestion use case. Money remains integer
 * cents here; a future database adapter is responsible for the Decimal conversion.
 */
export type PersistedCompetitorProductState = {
  id: string
  competitorId: string
  lastAvailability: Availability | null
  lastObservedAt: Date | null
  lastCheckAt: Date | null
  lastCheckStatus: CheckStatus | null
  lastError: string | null
  consecutiveFailures: number
}

export type PersistedPriceObservation = {
  id: string
  competitorProductId: string
  competitorId: string
  /** Current effective price; never a fallback for regular/sale. */
  observedCents: number
  /** Only with literal list/strikethrough semantics from the source. */
  regularCents: number | null
  /** Only when the source proves observed < a declared reference price. */
  saleCents: number | null
  currency: SupportedCurrency
  availability: Availability
  stateHash: string
  observedAt: Date
  lastSeenAt: Date
  seenCount: number
  firstRunId: string | null
  lastRunId: string | null
}

export type ObservationIngestionSnapshot = {
  competitorProduct: PersistedCompetitorProductState
  latestObservation: PersistedPriceObservation | null
}

export type AppendObservationCommand = Omit<PersistedPriceObservation, 'id' | 'seenCount'> & {
  seenCount: 1
}

export type TouchObservationCommand = {
  observationId: string
  expectedStateHash: string
  lastSeenAt: Date
  lastRunId: string | null
}

export type UpdateCompetitorProductStateCommand = {
  competitorProductId: string
  lastAvailability: Availability | null
  lastObservedAt: Date | null
  lastCheckAt: Date
  lastCheckStatus: CheckStatus
  lastError: string | null
  consecutiveFailures: number
}

export interface ObservationIngestionTransaction {
  readSnapshot(): Promise<ObservationIngestionSnapshot>
  appendObservation(command: AppendObservationCommand): Promise<PersistedPriceObservation>

  /**
   * Must conditionally update the latest row for this product only when both its id
   * and stateHash match. A mismatch is a transaction conflict, never a fallback append.
   */
  touchLatestObservation(command: TouchObservationCommand): Promise<PersistedPriceObservation>

  updateCompetitorProductState(command: UpdateCompetitorProductStateCommand): Promise<void>
}

export interface ObservationIngestionRepository {
  /**
   * The snapshot read, append/touch and product-state update must commit atomically
   * for one CompetitorProduct. Concurrent calls for the same product must serialize
   * (or use equivalent row locking/serializable retry semantics).
   */
  withObservationIngestionTransaction<TResult>(
    competitorProductId: string,
    work: (transaction: ObservationIngestionTransaction) => Promise<TResult>,
  ): Promise<TResult>
}
