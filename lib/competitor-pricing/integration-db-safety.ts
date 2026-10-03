import { createHash } from 'node:crypto'

export const COMPETITOR_PRICING_TEST_DATABASE_URL = 'COMPETITOR_PRICING_TEST_DATABASE_URL'
export const COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT =
  'COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT'
export const COMPETITOR_PRICING_TEST_DATABASE_BRANCH =
  'COMPETITOR_PRICING_TEST_DATABASE_BRANCH'
export const COMPETITOR_PRICING_INTEGRATION_MODE = 'COMPETITOR_PRICING_INTEGRATION_MODE'
export const COMPETITOR_PRICING_DB_WRITE_ENABLED = 'COMPETITOR_PRICING_DB_WRITE_ENABLED'

export const REQUIRED_INTEGRATION_MODE = 'isolated-test'

const PRODUCTION_DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
] as const

const PRODUCTION_LIKE_BRANCH = /(^|[._-])(prod(?:uction)?|live|main|master|default)([._-]|$)/i
const SAFE_BRANCH_LABEL = /^[a-z0-9][a-z0-9._-]{2,63}$/i
const SHA256_FINGERPRINT = /^sha256:[a-f0-9]{64}$/

export type CompetitorPricingDatabaseOperation = 'read' | 'write'
export type CompetitorPricingEnvironment = Readonly<Record<string, string | undefined>>

export type SafeDatabaseTargetDescription = Readonly<{
  driver: 'postgresql'
  hostname: string
  port: number
  database: string
  neonEndpointId: string
  branchLabel?: string
  fingerprint: `sha256:${string}`
  hasQueryParameters: boolean
}>

export type CompetitorPricingDatabaseSafetyErrorCode =
  | 'test_database_url_required'
  | 'invalid_database_url'
  | 'unsupported_database_scheme'
  | 'invalid_database_metadata'
  | 'non_neon_target'
  | 'unsupported_database_port'
  | 'integration_mode_required'
  | 'production_process_forbidden'
  | 'branch_label_required'
  | 'unsafe_branch_label'
  | 'target_fingerprint_required'
  | 'target_fingerprint_mismatch'
  | 'production_identity_required'
  | 'production_identity_invalid'
  | 'production_target_forbidden'
  | 'invalid_operation'
  | 'write_enablement_required'

export class CompetitorPricingDatabaseSafetyError extends Error {
  readonly code: CompetitorPricingDatabaseSafetyErrorCode
  readonly safeTarget?: SafeDatabaseTargetDescription

  constructor(
    code: CompetitorPricingDatabaseSafetyErrorCode,
    message: string,
    safeTarget?: SafeDatabaseTargetDescription,
  ) {
    super(message)
    this.name = 'CompetitorPricingDatabaseSafetyError'
    this.code = code
    this.safeTarget = safeTarget
  }
}

type ParsedDatabaseIdentity = Readonly<{
  connectionString: string
  canonicalIdentity: string
  canonicalEndpointIdentity: string
  isNeon: boolean
  safeTarget: SafeDatabaseTargetDescription
}>

/**
 * A guarded target deliberately keeps credentials in a private field. Logging or
 * JSON-stringifying this object exposes only the redacted descriptor.
 */
export class GuardedCompetitorPricingDatabaseTarget {
  readonly safeTarget: SafeDatabaseTargetDescription
  #connectionString: string

  constructor(connectionString: string, safeTarget: SafeDatabaseTargetDescription) {
    this.#connectionString = connectionString
    this.safeTarget = safeTarget
  }

  connectionString(): string {
    return this.#connectionString
  }

  toJSON(): SafeDatabaseTargetDescription {
    return this.safeTarget
  }

  toString(): string {
    return formatSafeDatabaseTarget(this.safeTarget)
  }
}

function fail(
  code: CompetitorPricingDatabaseSafetyErrorCode,
  message: string,
  safeTarget?: SafeDatabaseTargetDescription,
): never {
  throw new CompetitorPricingDatabaseSafetyError(code, message, safeTarget)
}

function canonicalHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  if (!normalized.endsWith('.neon.tech')) return normalized

  const labels = normalized.split('.')
  labels[0] = labels[0].replace(/-pooler$/, '')
  return labels.join('.')
}

function parseDatabaseIdentity(
  rawValue: string,
  options: { requireNeon: boolean; branchLabel?: string },
): ParsedDatabaseIdentity {
  if (rawValue !== rawValue.trim() || rawValue.length === 0) {
    fail('invalid_database_url', 'Database URL must be a non-empty value without surrounding whitespace.')
  }

  let url: URL
  try {
    url = new URL(rawValue)
  } catch {
    fail('invalid_database_url', 'Database URL is not a valid absolute URL.')
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    fail('unsupported_database_scheme', 'Database URL must use the postgresql:// or postgres:// scheme.')
  }

  if (url.hash) {
    fail('invalid_database_url', 'Database URL must not contain a fragment.')
  }

  const hostname = canonicalHostname(url.hostname)
  const port = url.port === '' ? 5432 : Number(url.port)
  if (port !== 5432) {
    fail('unsupported_database_port', 'The isolated Neon target must use PostgreSQL port 5432.')
  }

  let database: string
  try {
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    fail('invalid_database_metadata', 'Database name contains invalid URL encoding.')
  }

  if (
    !hostname ||
    !url.username ||
    !url.password ||
    !database ||
    database.includes('/') ||
    database.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(database)
  ) {
    fail(
      'invalid_database_metadata',
      'Database URL must include a hostname, username, password, and one database name.',
    )
  }

  const isNeon = hostname.endsWith('.neon.tech')
  const neonEndpointId = isNeon ? (hostname.split('.')[0] ?? '') : ''
  if (
    options.requireNeon &&
    (!isNeon || !/^ep-[a-z0-9-]+$/.test(neonEndpointId))
  ) {
    fail('non_neon_target', 'Competitor Pricing integration requires an identifiable Neon endpoint.')
  }

  const canonicalIdentity = `postgresql\u0000${hostname}\u0000${port}\u0000${database}`
  const canonicalEndpointIdentity = `postgresql\u0000${hostname}\u0000${port}`
  const fingerprint = `sha256:${createHash('sha256').update(canonicalIdentity).digest('hex')}` as const
  const safeTarget: SafeDatabaseTargetDescription = Object.freeze({
    driver: 'postgresql',
    hostname,
    port,
    database,
    neonEndpointId,
    ...(options.branchLabel ? { branchLabel: options.branchLabel } : {}),
    fingerprint,
    hasQueryParameters: url.search.length > 0,
  })

  return { connectionString: rawValue, canonicalIdentity, canonicalEndpointIdentity, isNeon, safeTarget }
}

export function describeCompetitorPricingDatabaseCandidate(
  rawValue: string,
  branchLabel?: string,
): SafeDatabaseTargetDescription {
  if (branchLabel !== undefined) validateBranchLabel(branchLabel)
  return parseDatabaseIdentity(rawValue, { requireNeon: true, branchLabel }).safeTarget
}

export function formatSafeDatabaseTarget(target: SafeDatabaseTargetDescription): string {
  const branch = target.branchLabel ? `; branch=${target.branchLabel}` : ''
  const query = target.hasQueryParameters ? '; query=present-redacted' : ''
  return `postgresql://<credentials-redacted>@${target.hostname}:${target.port}/${encodeURIComponent(target.database)}${branch}; endpoint=${target.neonEndpointId}; fingerprint=${target.fingerprint}${query}`
}

export function assertCompetitorPricingDatabaseSafety(
  environment: CompetitorPricingEnvironment,
  operation: CompetitorPricingDatabaseOperation,
): GuardedCompetitorPricingDatabaseTarget {
  if (operation !== 'read' && operation !== 'write') {
    fail('invalid_operation', 'Database operation must be explicitly classified as read or write.')
  }

  const targetUrl = environment[COMPETITOR_PRICING_TEST_DATABASE_URL]
  if (!targetUrl) {
    fail(
      'test_database_url_required',
      `${COMPETITOR_PRICING_TEST_DATABASE_URL} is required; production database variables are never a fallback.`,
    )
  }

  if (environment[COMPETITOR_PRICING_INTEGRATION_MODE] !== REQUIRED_INTEGRATION_MODE) {
    fail(
      'integration_mode_required',
      `${COMPETITOR_PRICING_INTEGRATION_MODE} must equal ${REQUIRED_INTEGRATION_MODE}.`,
    )
  }

  if (environment.NODE_ENV === 'production') {
    fail('production_process_forbidden', 'Competitor Pricing database integration is forbidden in NODE_ENV=production.')
  }

  const branchLabel = environment[COMPETITOR_PRICING_TEST_DATABASE_BRANCH]
  if (!branchLabel) {
    fail('branch_label_required', `${COMPETITOR_PRICING_TEST_DATABASE_BRANCH} is required.`)
  }
  validateBranchLabel(branchLabel)

  const target = parseDatabaseIdentity(targetUrl, { requireNeon: true, branchLabel })
  const expectedFingerprint = environment[COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT]
  if (!expectedFingerprint || !SHA256_FINGERPRINT.test(expectedFingerprint)) {
    fail(
      'target_fingerprint_required',
      `${COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT} must contain the full sha256 fingerprint of the approved target.`,
      target.safeTarget,
    )
  }
  if (expectedFingerprint !== target.safeTarget.fingerprint) {
    fail(
      'target_fingerprint_mismatch',
      'The configured test database does not match the approved target fingerprint.',
      target.safeTarget,
    )
  }

  const productionUrls = PRODUCTION_DATABASE_URL_KEYS.flatMap((key) => {
    const value = environment[key]
    return value ? [{ key, value }] : []
  })
  if (productionUrls.length === 0) {
    fail(
      'production_identity_required',
      'At least one production database URL must be present as an immutable denylist reference.',
      target.safeTarget,
    )
  }

  for (const production of productionUrls) {
    let productionIdentity: ParsedDatabaseIdentity
    try {
      productionIdentity = parseDatabaseIdentity(production.value, { requireNeon: false })
    } catch {
      fail(
        'production_identity_invalid',
        `Production database identity in ${production.key} is invalid; target safety cannot be proven.`,
        target.safeTarget,
      )
    }

    if (
      productionIdentity.canonicalIdentity === target.canonicalIdentity ||
      (productionIdentity.isNeon &&
        productionIdentity.canonicalEndpointIdentity === target.canonicalEndpointIdentity)
    ) {
      fail(
        'production_target_forbidden',
        `The isolated target resolves to the same database or Neon branch endpoint as ${production.key}.`,
        target.safeTarget,
      )
    }
  }

  if (operation === 'write' && environment[COMPETITOR_PRICING_DB_WRITE_ENABLED] !== 'true') {
    fail(
      'write_enablement_required',
      `${COMPETITOR_PRICING_DB_WRITE_ENABLED} must equal the exact string true for write-capable work.`,
      target.safeTarget,
    )
  }

  return new GuardedCompetitorPricingDatabaseTarget(target.connectionString, target.safeTarget)
}

function validateBranchLabel(branchLabel: string): void {
  if (!SAFE_BRANCH_LABEL.test(branchLabel) || PRODUCTION_LIKE_BRANCH.test(branchLabel)) {
    fail(
      'unsafe_branch_label',
      'The declared test branch label is invalid or looks production-like. This label is only an additional guard.',
    )
  }
}
