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

  it('rolls back exactly the six pricing tables and never Product', () => {
    expect(captures(rollback, /^DROP TABLE IF EXISTS "([^"]+)"/gim)).toEqual(EXPECTED_TABLES)
    expect(rollback).not.toMatch(/^\s*(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+"Product"\b/gim)
  })
})
