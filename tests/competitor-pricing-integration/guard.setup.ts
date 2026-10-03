import { requireCompetitorPricingIntegrationTarget } from './bootstrap'

// The suite is write-capable by design (fixtures, transactional race tests, cleanup),
// so it must fail before importing any test module unless every write guard passes.
requireCompetitorPricingIntegrationTarget('write')
