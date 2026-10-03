import { config } from 'dotenv'
import {
  assertCompetitorPricingDatabaseSafety,
  type CompetitorPricingDatabaseOperation,
  type GuardedCompetitorPricingDatabaseTarget,
} from '../../lib/competitor-pricing/integration-db-safety'

/**
 * Loads local environment metadata without overriding shell/CI values and then
 * returns an explicitly guarded target. Future tests must pass this target into
 * a dedicated client factory; importing lib/prisma is forbidden for this suite.
 */
export function requireCompetitorPricingIntegrationTarget(
  operation: CompetitorPricingDatabaseOperation = 'write',
): GuardedCompetitorPricingDatabaseTarget {
  config({ path: '.env.local', override: false, quiet: true })
  return assertCompetitorPricingDatabaseSafety(process.env, operation)
}
