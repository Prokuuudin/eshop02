import { describe, expect, it } from 'vitest'
import {
  assertCompetitorPricingDatabaseSafety,
  COMPETITOR_PRICING_DB_WRITE_ENABLED,
  COMPETITOR_PRICING_INTEGRATION_MODE,
  COMPETITOR_PRICING_TEST_DATABASE_BRANCH,
  COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT,
  COMPETITOR_PRICING_TEST_DATABASE_URL,
  CompetitorPricingDatabaseSafetyError,
  describeCompetitorPricingDatabaseCandidate,
  formatSafeDatabaseTarget,
  REQUIRED_INTEGRATION_MODE,
  type CompetitorPricingEnvironment,
} from './integration-db-safety'

const TEST_URL =
  'postgresql://pricing_user:test-secret@ep-pricing-stage9a-pooler.eu-central-1.aws.neon.tech/pricing_test?sslmode=require&channel_binding=require'
const PRODUCTION_URL =
  'postgresql://production_user:production-secret@ep-hairshop-production-pooler.eu-central-1.aws.neon.tech/hairshop?sslmode=require'

function completeEnvironment(
  overrides: CompetitorPricingEnvironment = {},
): CompetitorPricingEnvironment {
  return {
    [COMPETITOR_PRICING_TEST_DATABASE_URL]: TEST_URL,
    [COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT]:
      describeCompetitorPricingDatabaseCandidate(TEST_URL).fingerprint,
    [COMPETITOR_PRICING_TEST_DATABASE_BRANCH]: 'competitor-pricing-stage9a',
    [COMPETITOR_PRICING_INTEGRATION_MODE]: REQUIRED_INTEGRATION_MODE,
    [COMPETITOR_PRICING_DB_WRITE_ENABLED]: 'true',
    DATABASE_URL: PRODUCTION_URL,
    NODE_ENV: 'test',
    ...overrides,
  }
}

function expectSafetyCode(
  environment: CompetitorPricingEnvironment,
  code: CompetitorPricingDatabaseSafetyError['code'],
  operation: 'read' | 'write' = 'write',
) {
  try {
    assertCompetitorPricingDatabaseSafety(environment, operation)
    throw new Error('Expected safety guard to reject the environment')
  } catch (error) {
    expect(error).toBeInstanceOf(CompetitorPricingDatabaseSafetyError)
    expect((error as CompetitorPricingDatabaseSafetyError).code).toBe(code)
  }
}

describe('competitor pricing integration database safety', () => {
  it('never falls back to DATABASE_URL when the dedicated target is absent', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_URL]: undefined }),
      'test_database_url_required',
    )
  })

  it('rejects an unclassified operation at runtime', () => {
    expectSafetyCode(completeEnvironment(), 'invalid_operation', 'mutation' as 'write')
  })

  it('rejects a missing explicit integration mode', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_INTEGRATION_MODE]: undefined }),
      'integration_mode_required',
    )
  })

  it('rejects execution inside a production process', () => {
    expectSafetyCode(completeEnvironment({ NODE_ENV: 'production' }), 'production_process_forbidden')
  })

  it('rejects non-PostgreSQL and non-Neon targets', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_URL]: 'mysql://user:pass@db.example/test' }),
      'unsupported_database_scheme',
    )
    expectSafetyCode(
      completeEnvironment({
        [COMPETITOR_PRICING_TEST_DATABASE_URL]: 'postgresql://user:pass@db.example/test',
      }),
      'non_neon_target',
    )
  })

  it('rejects a malformed dedicated target URL', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_URL]: 'not-a-database-url' }),
      'invalid_database_url',
    )
  })

  it('rejects a URL without the connection metadata required to identify the target', () => {
    expectSafetyCode(
      completeEnvironment({
        [COMPETITOR_PRICING_TEST_DATABASE_URL]:
          'postgresql://pricing_user@ep-pricing-stage9a.eu-central-1.aws.neon.tech/pricing_test',
      }),
      'invalid_database_metadata',
    )
  })

  it('rejects missing and mismatched approved fingerprints', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT]: undefined }),
      'target_fingerprint_required',
    )
    expectSafetyCode(
      completeEnvironment({
        [COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT]: `sha256:${'0'.repeat(64)}`,
      }),
      'target_fingerprint_mismatch',
    )
  })

  it('never includes target password or query text in a guard error', () => {
    try {
      assertCompetitorPricingDatabaseSafety(
        completeEnvironment({
          [COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT]: `sha256:${'0'.repeat(64)}`,
        }),
        'write',
      )
      throw new Error('Expected fingerprint mismatch')
    } catch (error) {
      expect(error).toBeInstanceOf(CompetitorPricingDatabaseSafetyError)
      const safeError = error as CompetitorPricingDatabaseSafetyError
      const rendered = `${safeError.message}\n${JSON.stringify(safeError)}`
      expect(rendered).not.toContain('test-secret')
      expect(rendered).not.toContain('sslmode')
      expect(rendered).not.toContain('channel_binding')
    }
  })

  it('rejects missing or production-like branch labels as an additional guard', () => {
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_BRANCH]: undefined }),
      'branch_label_required',
    )
    expectSafetyCode(
      completeEnvironment({ [COMPETITOR_PRICING_TEST_DATABASE_BRANCH]: 'production-copy' }),
      'unsafe_branch_label',
    )
  })

  it('fails closed when no production identity can be used as a denylist', () => {
    expectSafetyCode(completeEnvironment({ DATABASE_URL: undefined }), 'production_identity_required')
  })

  it('fails closed when a production identity is malformed', () => {
    expectSafetyCode(completeEnvironment({ DATABASE_URL: 'not-a-url' }), 'production_identity_invalid')
  })

  it('rejects an exact production target', () => {
    const sameTarget = completeEnvironment({ DATABASE_URL: TEST_URL })
    expectSafetyCode(sameTarget, 'production_target_forbidden')
  })

  it('treats Neon pooled and direct hostnames as the same database identity', () => {
    const directProductionUrl = TEST_URL.replace('-pooler.', '.')
    expectSafetyCode(
      completeEnvironment({ DATABASE_URL: directProductionUrl }),
      'production_target_forbidden',
    )
  })

  it('rejects another database name on the production Neon branch endpoint', () => {
    const sameEndpoint = TEST_URL.replace('/pricing_test?', '/another_database?')
    expectSafetyCode(
      completeEnvironment({ DATABASE_URL: sameEndpoint }),
      'production_target_forbidden',
    )
  })

  it('checks every available production URL alias', () => {
    expectSafetyCode(
      completeEnvironment({ POSTGRES_URL_NON_POOLING: TEST_URL.replace('-pooler.', '.') }),
      'production_target_forbidden',
    )
  })

  it('requires an exact write enablement value only for write-capable work', () => {
    const disabled = completeEnvironment({ [COMPETITOR_PRICING_DB_WRITE_ENABLED]: 'TRUE' })
    expectSafetyCode(disabled, 'write_enablement_required')
    expect(() => assertCompetitorPricingDatabaseSafety(disabled, 'read')).not.toThrow()
  })

  it('accepts a distinct approved target and returns only safe enumerable metadata', () => {
    const target = assertCompetitorPricingDatabaseSafety(completeEnvironment(), 'write')
    const serialized = JSON.stringify(target)
    const description = formatSafeDatabaseTarget(target.safeTarget)

    expect(target.connectionString()).toBe(TEST_URL)
    expect(target.safeTarget.neonEndpointId).toBe('ep-pricing-stage9a')
    expect(target.safeTarget.branchLabel).toBe('competitor-pricing-stage9a')
    expect(target.safeTarget.hasQueryParameters).toBe(true)
    expect(serialized).not.toContain('test-secret')
    expect(serialized).not.toContain('sslmode')
    expect(description).toContain('<credentials-redacted>')
    expect(description).toContain('query=present-redacted')
    expect(description).not.toContain('test-secret')
    expect(description).not.toContain('sslmode')
  })
})
