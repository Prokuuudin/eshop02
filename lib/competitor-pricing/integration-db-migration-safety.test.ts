import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EXPECTED_TABLES = [
  'Competitor',
  'CompetitorMonitorRun',
  'CompetitorPriceObservation',
  'CompetitorProduct',
  'CompetitorProductMatch',
  'PricingRecommendation',
].sort()

const migration = readFileSync(
  new URL(
    '../../prisma/pending-migrations/20261003120000_competitor_pricing/migration.sql',
    import.meta.url,
  ),
  'utf8',
)
const rollback = readFileSync(
  new URL(
    '../../prisma/pending-migrations/20261003120000_competitor_pricing/rollback.sql',
    import.meta.url,
  ),
  'utf8',
)

function captures(sql: string, pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map((match) => match[1]).sort()
}

describe('pending competitor pricing migration safety', () => {
  it('creates and alters only the six pricing tables', () => {
    expect(captures(migration, /^CREATE TABLE "([^"]+)"/gim)).toEqual(EXPECTED_TABLES)

    const alteredTables = captures(migration, /^ALTER TABLE "([^"]+)"/gim)
    expect(alteredTables.every((table) => EXPECTED_TABLES.includes(table))).toBe(true)
    expect(alteredTables).not.toContain('Product')
  })

  it('contains no data mutation or destructive forward statement', () => {
    expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/gim)
  })

  it('stores a mandatory positive observedPrice with literal regular/sale semantics', () => {
    const observationTable = /CREATE TABLE "CompetitorPriceObservation" \(([\s\S]*?)\n\);/.exec(migration)?.[1] ?? ''
    expect(observationTable).toMatch(/"observedPrice" DECIMAL\(12,2\) NOT NULL/)
    expect(observationTable).toMatch(/"regularPrice" DECIMAL\(12,2\),/)
    expect(observationTable).toMatch(/"salePrice" DECIMAL\(12,2\),/)
    expect(migration).toMatch(/CHECK \("observedPrice" > 0 AND/)
    expect(migration).toContain('"CompetitorPriceObservation_price_semantics_check"')
    expect(migration).toMatch(/"salePrice" = "observedPrice" AND "regularPrice" IS NOT NULL AND "regularPrice" > "salePrice"/)
    expect(migration).toMatch(/"salePrice" IS NULL AND \("regularPrice" IS NULL OR "regularPrice" = "observedPrice"\)/)
    // The old ambiguous model ("either regular or sale is the price") must be gone.
    expect(migration).not.toContain('CompetitorPriceObservation_has_price_check')
  })

  it('rolls back exactly the six pricing tables and never Product', () => {
    expect(captures(rollback, /^DROP TABLE IF EXISTS "([^"]+)"/gim)).toEqual(EXPECTED_TABLES)
    expect(rollback).not.toMatch(/^\s*(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+"Product"\b/gim)
  })
})
