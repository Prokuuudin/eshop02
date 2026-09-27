import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { buildControlledPlan, EXPECTED_XML_SHA256, FIRST_WAVE_SIZE, parseAndValidateAllowlist, sha256, type FirstWaveAllowlist, type ScopeProduct } from './controlled-first-wave'
import type { ErpProduct } from './erp-adapter'

function fixture() {
  const entries = Array.from({ length: FIRST_WAVE_SIZE }, (_, i) => ({ productId: `p${i}`, productSku: `s${i}`, xmlSku: `s${i}`, externalIdToSet: `s${i}` }))
  const allowlist: FirstWaveAllowlist = { xmlSha256: EXPECTED_XML_SHA256, entries }
  const db: ScopeProduct[] = entries.map((row, i) => ({ id: row.productId, externalId: row.externalIdToSet, sku: row.productSku, price: i === 0 ? 10 : 2, stock: 5, isActive: i % 2 === 0, isDeleted: false }))
  const feed: ErpProduct[] = entries.map((row, i) => ({ externalId: row.xmlSku, sku: row.xmlSku, title: row.xmlSku, price: i === 0 ? 0 : 3, stock: 0, prices: { price1: 99, price2: i === 0 ? 0 : 3, price3: 1, price4: 4 }, warehouseQuantities: { '10003': 100 } }))
  return { allowlist, db, feed }
}

describe('controlled first wave', () => {
  it('validates the immutable checked-in allowlist and rejects tampering', () => {
    const content = readFileSync('first-wave-external-id-allowlist.json', 'utf8')
    expect(parseAndValidateAllowlist(content, EXPECTED_XML_SHA256).entries).toHaveLength(FIRST_WAVE_SIZE)
    expect(() => parseAndValidateAllowlist(content + ' ', EXPECTED_XML_SHA256)).toThrow('ALLOWLIST_SHA_MISMATCH')
    expect(() => parseAndValidateAllowlist(content, 'wrong')).toThrow('XML_SHA_MISMATCH')
    expect(sha256(content)).toHaveLength(64)
  })

  it('ignores feed products outside allowlist and never plans inserts or deactivation', () => {
    const { allowlist, db, feed } = fixture(); feed.push({ externalId: 'new', sku: 'new', title: 'new', price: 8, stock: 9 })
    const plan = buildControlledPlan(allowlist, feed, db, {})
    expect(plan.rows).toHaveLength(FIRST_WAVE_SIZE)
    expect(plan.rows.some(row => row.externalId === 'new')).toBe(false)
    expect(plan.metrics.newIgnored).toBe(1)
  })

  it('preserves current price for zero price2 without fallback and uses only allowed warehouses', () => {
    const { allowlist, db, feed } = fixture(); feed[0].warehouseQuantities = { '10000': 2, '10001': 3, '10002': -4, '10005': 1, '10003': 100 }; feed[0].stock = 6
    const plan = buildControlledPlan(allowlist, feed, db, {})
    expect(plan.rows[0]).toMatchObject({ price: 10, stock: 6, isActive: true })
    expect(plan.metrics.priceTierZeroSkipped).toBe(1)
    expect(plan.extraData.s0.prices).toMatchObject({ price1: 99, price2: 0, price3: 1, price4: 4 })
    expect(plan.extraData.s0.warehouseQuantities).toMatchObject({ '10003': 100 })
  })

  it('fails closed on scope, identity, conflict, and stock-formula mismatches', () => {
    const a = fixture(); expect(() => buildControlledPlan(a.allowlist, a.feed, a.db.slice(1), {})).toThrow('DATABASE_SCOPE_SIZE_MISMATCH')
    const b = fixture(); b.db[0].externalId = 'wrong'; expect(() => buildControlledPlan(b.allowlist, b.feed, b.db, {})).toThrow('IMMUTABLE_SCOPE_MISMATCH')
    const c = fixture(); c.feed.push({ ...c.feed[0] }); expect(() => buildControlledPlan(c.allowlist, c.feed, c.db, {})).toThrow('FEED_CONFLICTS')
    const d = fixture(); d.feed[0].stock = 1; expect(() => buildControlledPlan(d.allowlist, d.feed, d.db, {})).toThrow('STOCK_FORMULA_MISMATCHES')
  })
})
