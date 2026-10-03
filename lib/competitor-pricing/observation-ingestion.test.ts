import { describe, expect, it } from 'vitest'
import type { AdapterParseResult, ParseFailureCode, ParsedListing } from './adapters/types'
import { ingestObservation, type IngestObservationInput, type ObservationIngestionAttempt } from './observation-ingestion'
import { normalizeObservation, type NormalizedObservation, type RawObservation } from './observation'
import type {
  AppendObservationCommand,
  ObservationIngestionRepository,
  ObservationIngestionTransaction,
  PersistedCompetitorProductState,
  PersistedPriceObservation,
  TouchObservationCommand,
  UpdateCompetitorProductStateCommand,
} from './observation-repository'

function cloneDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime())
}

function cloneProduct(product: PersistedCompetitorProductState): PersistedCompetitorProductState {
  return {
    ...product,
    lastObservedAt: cloneDate(product.lastObservedAt),
    lastCheckAt: cloneDate(product.lastCheckAt),
  }
}

function cloneObservation(observation: PersistedPriceObservation): PersistedPriceObservation {
  return {
    ...observation,
    observedAt: new Date(observation.observedAt.getTime()),
    lastSeenAt: new Date(observation.lastSeenAt.getTime()),
  }
}

/** Test-only transactional fake. It deliberately models one-product serialization and rollback. */
class FakeObservationRepository implements ObservationIngestionRepository {
  private readonly products = new Map<string, PersistedCompetitorProductState>()
  private readonly observations = new Map<string, PersistedPriceObservation[]>()
  private readonly transactionTails = new Map<string, Promise<void>>()
  private nextObservationId = 1

  constructor(...products: PersistedCompetitorProductState[]) {
    for (const product of products) {
      this.products.set(product.id, cloneProduct(product))
      this.observations.set(product.id, [])
    }
  }

  product(id: string): PersistedCompetitorProductState {
    const product = this.products.get(id)
    if (!product) throw new Error(`Unknown fake product: ${id}`)
    return cloneProduct(product)
  }

  history(id: string): PersistedPriceObservation[] {
    return (this.observations.get(id) ?? []).map(cloneObservation)
  }

  async withObservationIngestionTransaction<TResult>(
    competitorProductId: string,
    work: (transaction: ObservationIngestionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.transactionTails.get(competitorProductId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.transactionTails.set(competitorProductId, tail)
    await previous

    try {
      const storedProduct = this.products.get(competitorProductId)
      if (!storedProduct) throw new Error(`Unknown fake product: ${competitorProductId}`)
      let workingProduct = cloneProduct(storedProduct)
      const workingHistory = this.history(competitorProductId)

      const transaction: ObservationIngestionTransaction = {
        readSnapshot: async () => ({
          competitorProduct: cloneProduct(workingProduct),
          latestObservation: workingHistory.length === 0 ? null : cloneObservation(workingHistory[workingHistory.length - 1]),
        }),
        appendObservation: async (command: AppendObservationCommand) => {
          const observation: PersistedPriceObservation = {
            ...command,
            id: `observation-${this.nextObservationId++}`,
            observedAt: new Date(command.observedAt.getTime()),
            lastSeenAt: new Date(command.lastSeenAt.getTime()),
          }
          workingHistory.push(observation)
          return cloneObservation(observation)
        },
        touchLatestObservation: async (command: TouchObservationCommand) => {
          const latest = workingHistory[workingHistory.length - 1]
          if (!latest || latest.id !== command.observationId || latest.stateHash !== command.expectedStateHash) {
            throw new Error('Conditional touch conflict')
          }
          latest.lastSeenAt = new Date(command.lastSeenAt.getTime())
          latest.lastRunId = command.lastRunId
          latest.seenCount += 1
          return cloneObservation(latest)
        },
        updateCompetitorProductState: async (command: UpdateCompetitorProductStateCommand) => {
          if (command.competitorProductId !== workingProduct.id) throw new Error('Product update identity mismatch')
          workingProduct = {
            ...workingProduct,
            lastAvailability: command.lastAvailability,
            lastObservedAt: cloneDate(command.lastObservedAt),
            lastCheckAt: new Date(command.lastCheckAt.getTime()),
            lastCheckStatus: command.lastCheckStatus,
            lastError: command.lastError,
            consecutiveFailures: command.consecutiveFailures,
          }
        },
      }

      const result = await work(transaction)
      this.products.set(competitorProductId, cloneProduct(workingProduct))
      this.observations.set(competitorProductId, workingHistory.map(cloneObservation))
      return result
    } finally {
      release()
      if (this.transactionTails.get(competitorProductId) === tail) this.transactionTails.delete(competitorProductId)
    }
  }
}

const COMPETITOR_ID = 'competitor-1'
const PRODUCT_ID = 'competitor-product-1'

function emptyProduct(id = PRODUCT_ID, competitorId = COMPETITOR_ID): PersistedCompetitorProductState {
  return {
    id,
    competitorId,
    lastAvailability: null,
    lastObservedAt: null,
    lastCheckAt: null,
    lastCheckStatus: null,
    lastError: null,
    consecutiveFailures: 0,
  }
}

function at(hour: number, minute = 0): Date {
  return new Date(`2026-10-03T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`)
}

function parsed(observation: NormalizedObservation): ParsedListing {
  return {
    ok: true,
    url: 'https://competitor.test/item',
    sourceProductId: 'source-1',
    title: 'Synthetic item',
    brand: 'Example',
    ean: null,
    manufacturerSku: null,
    sizeText: null,
    observation,
  }
}

function adapterResult(raw: RawObservation): AdapterParseResult {
  const result = normalizeObservation(raw)
  return result.ok ? parsed(result.value) : result
}

function eventInput(
  checkedAt: Date,
  attempt: ObservationIngestionAttempt,
  productId = PRODUCT_ID,
  competitorId = COMPETITOR_ID,
  runId: string | null = `run-${checkedAt.toISOString()}`,
): IngestObservationInput {
  return {
    competitor: { id: competitorId },
    competitorProduct: { id: productId, competitorId },
    event: { checkedAt, runId },
    attempt,
  }
}

function successfulAttempt(raw: RawObservation): ObservationIngestionAttempt {
  const result = adapterResult(raw)
  if (!result.ok) throw new Error(`Expected a valid test observation, got ${result.code}`)
  return { kind: 'adapter_result', result }
}

const PRICE_A = { regularPrice: '10.00', currency: 'EUR', availability: 'in_stock' } as const
const PRICE_B = { regularPrice: '12.00', currency: 'EUR', availability: 'in_stock' } as const

describe('observation ingestion append/touch', () => {
  it('appends the first observation and mirrors only operational current state', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const outcome = await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))

    expect(outcome).toMatchObject({
      kind: 'success',
      action: 'append',
      counters: { productsChecked: 1, observationsCreated: 1, observationsUnchanged: 0 },
    })
    expect(repository.history(PRODUCT_ID)).toMatchObject([{
      competitorProductId: PRODUCT_ID,
      competitorId: COMPETITOR_ID,
      regularCents: 1000,
      saleCents: null,
      currency: 'EUR',
      availability: 'in_stock',
      observedAt: at(10),
      lastSeenAt: at(10),
      seenCount: 1,
    }])
    expect(repository.product(PRODUCT_ID)).toMatchObject({
      lastAvailability: 'in_stock',
      lastObservedAt: at(10),
      lastCheckAt: at(10),
      lastCheckStatus: 'ok',
      lastError: null,
      consecutiveFailures: 0,
    })
  })

  it('touches only the latest row for a later identical polling event', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A), PRODUCT_ID, COMPETITOR_ID, 'run-1'))
    const outcome = await ingestObservation(repository, eventInput(at(11), successfulAttempt(PRICE_A), PRODUCT_ID, COMPETITOR_ID, 'run-2'))

    expect(outcome).toMatchObject({
      kind: 'success',
      action: 'touch',
      counters: { observationsCreated: 0, observationsUnchanged: 1 },
    })
    expect(repository.history(PRODUCT_ID)).toMatchObject([{
      observedAt: at(10),
      lastSeenAt: at(11),
      seenCount: 2,
      firstRunId: 'run-1',
      lastRunId: 'run-2',
    }])
  })

  it.each([
    ['regular price', { regularPrice: '11.00', currency: 'EUR', availability: 'in_stock' }],
    ['sale price', { regularPrice: '10.00', salePrice: '9.00', currency: 'EUR', availability: 'in_stock' }],
    ['availability', { regularPrice: '10.00', currency: 'EUR', availability: 'out_of_stock' }],
  ] as const)('appends when %s changes', async (_label, changed) => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    const outcome = await ingestObservation(repository, eventInput(at(11), successfulAttempt(changed)))

    expect(outcome).toMatchObject({ kind: 'success', action: 'append' })
    expect(repository.history(PRODUCT_ID)).toHaveLength(2)
  })

  it('treats equivalent decimal text as one normalized money state', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt({ regularPrice: '12.3', currency: 'EUR' })))
    const outcome = await ingestObservation(repository, eventInput(at(11), successfulAttempt({ regularPrice: '12.30', currency: 'EUR' })))

    expect(outcome).toMatchObject({ kind: 'success', action: 'touch' })
    expect(repository.history(PRODUCT_ID)).toMatchObject([{ regularCents: 1230, seenCount: 2 }])
  })
})

describe('observation ingestion history', () => {
  it('stores A→A→A as one row with first-observed and last-seen times', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    for (const hour of [10, 11, 12]) {
      await ingestObservation(repository, eventInput(at(hour), successfulAttempt(PRICE_A)))
    }

    expect(repository.history(PRODUCT_ID)).toMatchObject([{
      regularCents: 1000,
      observedAt: at(10),
      lastSeenAt: at(12),
      seenCount: 3,
    }])
  })

  it('stores A→B as two rows', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    await ingestObservation(repository, eventInput(at(11), successfulAttempt(PRICE_B)))

    expect(repository.history(PRODUCT_ID).map(({ regularCents }) => regularCents)).toEqual([1000, 1200])
  })

  it('stores A→B→A as three sequential states rather than finding an old hash', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    await ingestObservation(repository, eventInput(at(11), successfulAttempt(PRICE_B)))
    await ingestObservation(repository, eventInput(at(12), successfulAttempt(PRICE_A)))

    expect(repository.history(PRODUCT_ID).map(({ regularCents, observedAt, lastSeenAt }) => ({
      regularCents,
      observedAt,
      lastSeenAt,
    }))).toEqual([
      { regularCents: 1000, observedAt: at(10), lastSeenAt: at(10) },
      { regularCents: 1200, observedAt: at(11), lastSeenAt: at(11) },
      { regularCents: 1000, observedAt: at(12), lastSeenAt: at(12) },
    ])
  })

  it('records both InStock→OutOfStock and OutOfStock→InStock transitions', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    await ingestObservation(repository, eventInput(at(11), successfulAttempt({ ...PRICE_A, availability: 'out_of_stock' })))
    await ingestObservation(repository, eventInput(at(12), successfulAttempt(PRICE_A)))

    expect(repository.history(PRODUCT_ID).map(({ availability }) => availability)).toEqual([
      'in_stock',
      'out_of_stock',
      'in_stock',
    ])
  })
})

describe('observation ingestion failures', () => {
  it.each([
    ['invalid price', { regularPrice: 'NaN', currency: 'EUR' }, 'invalid_price'],
    ['zero price', { regularPrice: '0.00', currency: 'EUR' }, 'non_positive_price'],
    ['foreign currency', { regularPrice: '10.00', currency: 'USD' }, 'unsupported_currency'],
    ['missing currency', { regularPrice: '10.00' }, 'unsupported_currency'],
  ] as const)('%s is a structured parse failure and writes no observation', async (_label, raw, expectedCode) => {
    const repository = new FakeObservationRepository(emptyProduct())
    const result = adapterResult(raw)
    expect(result).toEqual({ ok: false, code: expectedCode })

    const outcome = await ingestObservation(repository, eventInput(at(10), { kind: 'adapter_result', result }))
    expect(outcome).toMatchObject({
      kind: 'parse_failure',
      code: expectedCode,
      counters: { productsChecked: 1, parseFailures: 1 },
    })
    expect(repository.history(PRODUCT_ID)).toEqual([])
  })

  it.each([
    'no_jsonld',
    'no_product',
    'ambiguous_product',
    'no_offer',
    'ambiguous_offers',
    'too_many_jsonld_blocks',
    'jsonld_block_too_large',
    'jsonld_total_too_large',
    'jsonld_too_complex',
  ] satisfies ParseFailureCode[])('does not write an observation for adapter failure %s', async (code) => {
    const repository = new FakeObservationRepository(emptyProduct())
    const outcome = await ingestObservation(repository, eventInput(at(10), {
      kind: 'adapter_result',
      result: { ok: false, code },
    }))

    expect(outcome).toMatchObject({ kind: 'parse_failure', code })
    expect(repository.history(PRODUCT_ID)).toEqual([])
    expect(repository.product(PRODUCT_ID)).toMatchObject({ lastCheckStatus: 'parse_error', lastError: code })
  })

  it('does not touch or replace the last valid observation after a parse failure', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    await ingestObservation(repository, eventInput(at(11), {
      kind: 'adapter_result',
      result: { ok: false, code: 'no_product' },
    }))

    expect(repository.history(PRODUCT_ID)).toMatchObject([{
      regularCents: 1000,
      observedAt: at(10),
      lastSeenAt: at(10),
      seenCount: 1,
    }])
    expect(repository.product(PRODUCT_ID)).toMatchObject({
      lastAvailability: 'in_stock',
      lastObservedAt: at(10),
      lastCheckAt: at(11),
      lastCheckStatus: 'parse_error',
      lastError: 'no_product',
      consecutiveFailures: 1,
    })
  })

  it('returns a transient fetch failure without an observation', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const outcome = await ingestObservation(repository, eventInput(at(10), {
      kind: 'fetch_failure',
      code: 'timeout',
      retryable: true,
    }))

    expect(outcome).toMatchObject({
      kind: 'fetch_failure',
      code: 'timeout',
      retryable: true,
      counters: { fetchFailures: 1 },
    })
    expect(repository.history(PRODUCT_ID)).toEqual([])
    expect(repository.product(PRODUCT_ID)).toMatchObject({ lastCheckStatus: 'fetch_error', lastError: 'timeout' })
  })

  it('returns blocked without an observation', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const outcome = await ingestObservation(repository, eventInput(at(10), { kind: 'blocked', code: 'challenge' }))

    expect(outcome).toMatchObject({ kind: 'blocked', code: 'challenge', counters: { fetchFailures: 1 } })
    expect(repository.history(PRODUCT_ID)).toEqual([])
    expect(repository.product(PRODUCT_ID)).toMatchObject({ lastCheckStatus: 'blocked', lastError: 'challenge' })
  })

  it('returns rate limited without an observation', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const outcome = await ingestObservation(repository, eventInput(at(10), { kind: 'rate_limited', retryAfterSeconds: 120 }))

    expect(outcome).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 120, counters: { fetchFailures: 1 } })
    expect(repository.history(PRODUCT_ID)).toEqual([])
    expect(repository.product(PRODUCT_ID)).toMatchObject({ lastCheckStatus: 'fetch_error', lastError: 'rate_limited' })
  })
})

describe('observation ingestion idempotency and isolation', () => {
  it('makes an exact event replay a no-op without incrementing seenCount or run counters', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const input = eventInput(at(10), successfulAttempt(PRICE_A))
    await ingestObservation(repository, input)
    const replay = await ingestObservation(repository, input)

    expect(replay).toEqual({ kind: 'no_op', reason: 'duplicate_event', counters: {
      productsChecked: 0,
      observationsCreated: 0,
      observationsUnchanged: 0,
      parseFailures: 0,
      fetchFailures: 0,
    } })
    expect(repository.history(PRODUCT_ID)).toMatchObject([{ seenCount: 1, lastSeenAt: at(10) }])
  })

  it('touches a sequential duplicate state when it is a distinct later polling event', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    const later = await ingestObservation(repository, eventInput(at(10, 1), successfulAttempt(PRICE_A)))

    expect(later).toMatchObject({ kind: 'success', action: 'touch' })
    expect(repository.history(PRODUCT_ID)).toMatchObject([{ seenCount: 2, lastSeenAt: at(10, 1) }])
  })

  it('accepts a successful retry after a transient failure when it has a new server attempt time', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    await ingestObservation(repository, eventInput(at(10), { kind: 'fetch_failure', code: 'timeout', retryable: true }))
    const retry = await ingestObservation(repository, eventInput(at(10, 1), successfulAttempt(PRICE_A)))

    expect(retry).toMatchObject({ kind: 'success', action: 'append' })
    expect(repository.history(PRODUCT_ID)).toHaveLength(1)
    expect(repository.product(PRODUCT_ID)).toMatchObject({
      lastCheckAt: at(10, 1),
      lastObservedAt: at(10, 1),
      lastCheckStatus: 'ok',
      lastError: null,
      consecutiveFailures: 0,
    })
  })

  it('rejects an older replay after a newer state without restoring stale history', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const oldEvent = eventInput(at(10), successfulAttempt(PRICE_A))
    await ingestObservation(repository, oldEvent)
    await ingestObservation(repository, eventInput(at(11), successfulAttempt(PRICE_B)))
    const stale = await ingestObservation(repository, oldEvent)

    expect(stale).toMatchObject({ kind: 'no_op', reason: 'stale_event' })
    expect(repository.history(PRODUCT_ID).map(({ regularCents }) => regularCents)).toEqual([1000, 1200])
  })

  it('serializes concurrent replays so only one append commits', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const input = eventInput(at(10), successfulAttempt(PRICE_A))
    const outcomes = await Promise.all([
      ingestObservation(repository, input),
      ingestObservation(repository, input),
    ])

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['no_op', 'success'])
    expect(repository.history(PRODUCT_ID)).toMatchObject([{ seenCount: 1 }])
  })

  it('keeps histories isolated by CompetitorProduct', async () => {
    const secondProductId = 'competitor-product-2'
    const repository = new FakeObservationRepository(emptyProduct(), emptyProduct(secondProductId))
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_A)))
    await ingestObservation(repository, eventInput(at(10), successfulAttempt(PRICE_B), secondProductId))

    expect(repository.history(PRODUCT_ID).map(({ regularCents }) => regularCents)).toEqual([1000])
    expect(repository.history(secondProductId).map(({ regularCents }) => regularCents)).toEqual([1200])
  })

  it('rejects a Competitor/CompetitorProduct ownership mismatch before persistence', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const input = eventInput(at(10), successfulAttempt(PRICE_A))
    input.competitor = { id: 'different-competitor' }

    await expect(ingestObservation(repository, input)).rejects.toThrow('does not belong')
    expect(repository.history(PRODUCT_ID)).toEqual([])
    expect(repository.product(PRODUCT_ID).lastCheckAt).toBeNull()
  })

  it('rejects an invalid server timestamp before persistence', async () => {
    const repository = new FakeObservationRepository(emptyProduct())
    const input = eventInput(new Date(Number.NaN), successfulAttempt(PRICE_A), PRODUCT_ID, COMPETITOR_ID, 'invalid-time-event')

    await expect(ingestObservation(repository, input)).rejects.toThrow('checkedAt')
    expect(repository.history(PRODUCT_ID)).toEqual([])
  })
})
