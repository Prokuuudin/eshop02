import { config } from 'dotenv'
import {
  assertCompetitorPricingDatabaseSafety,
  COMPETITOR_PRICING_TEST_DATABASE_BRANCH,
  COMPETITOR_PRICING_TEST_DATABASE_URL,
  CompetitorPricingDatabaseSafetyError,
  describeCompetitorPricingDatabaseCandidate,
  formatSafeDatabaseTarget,
} from '../lib/competitor-pricing/integration-db-safety'

// Local production identity is loaded only for denylist comparison. dotenv never
// overrides values explicitly supplied by the operator/CI environment.
config({ path: '.env.local', override: false, quiet: true })

type Command = '--describe' | '--read' | '--write'

function parseCommand(value: string | undefined): Command {
  if (value === '--describe' || value === '--read' || value === '--write') return value
  throw new Error('Expected exactly one command: --describe, --read, or --write.')
}

function main() {
  const command = parseCommand(process.argv[2])

  if (command === '--describe') {
    const candidateUrl = process.env[COMPETITOR_PRICING_TEST_DATABASE_URL]
    if (!candidateUrl) {
      throw new CompetitorPricingDatabaseSafetyError(
        'test_database_url_required',
        `${COMPETITOR_PRICING_TEST_DATABASE_URL} is required; production database variables are never a fallback.`,
      )
    }
    const branchLabel = process.env[COMPETITOR_PRICING_TEST_DATABASE_BRANCH]
    if (!branchLabel) {
      throw new CompetitorPricingDatabaseSafetyError(
        'branch_label_required',
        `${COMPETITOR_PRICING_TEST_DATABASE_BRANCH} is required.`,
      )
    }
    const safeTarget = describeCompetitorPricingDatabaseCandidate(candidateUrl, branchLabel)
    console.log(formatSafeDatabaseTarget(safeTarget))
    return
  }

  const operation = command === '--write' ? 'write' : 'read'
  const guardedTarget = assertCompetitorPricingDatabaseSafety(process.env, operation)
  console.log(`Competitor Pricing database ${operation} preflight passed.`)
  console.log(formatSafeDatabaseTarget(guardedTarget.safeTarget))
}

try {
  main()
} catch (error) {
  if (error instanceof CompetitorPricingDatabaseSafetyError) {
    console.error(`[competitor-pricing-db:${error.code}] ${error.message}`)
    if (error.safeTarget) console.error(formatSafeDatabaseTarget(error.safeTarget))
  } else {
    console.error('Competitor Pricing database preflight failed before a safe target was established.')
  }
  process.exitCode = 1
}
