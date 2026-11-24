import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRISMA_GLOBAL_OMIT, PRODUCT_RETAIL_COLUMNS_OMIT } from './prisma-omit'

describe('Prisma global omit for separately-deployed Product columns', () => {
  it('omits every Product column added by the retail migration, so code runs before the migration', () => {
    const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations/20261124120000_retail_price_foundation/migration.sql'), 'utf8')
      .replace(/--.*$/gmu, '')
    const added = [...sql.matchAll(/ADD COLUMN\s+"(\w+)"/gu)].map((match) => match[1]).sort()
    expect(added.length).toBe(6)
    expect(Object.keys(PRODUCT_RETAIL_COLUMNS_OMIT).sort()).toEqual(added)
    expect(Object.values(PRODUCT_RETAIL_COLUMNS_OMIT).every((value) => value === true)).toBe(true)
  })

  it('is wired into the app client', () => {
    expect(PRISMA_GLOBAL_OMIT.product).toBe(PRODUCT_RETAIL_COLUMNS_OMIT)
    expect(readFileSync(path.join(process.cwd(), 'lib/prisma.ts'), 'utf8')).toContain('omit: PRISMA_GLOBAL_OMIT')
  })
})
