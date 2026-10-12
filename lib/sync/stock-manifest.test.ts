import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { verifyStockReconciliationManifest } from './ftps-source-verification'

const xml = '<root><item><sku>A</sku></item></root>'
const base = {
  schemaVersion: 1,
  generatedAt: '2026-10-12T10:01:00Z',
  runStartedAt: '2026-10-12T10:00:00Z',
  xmlSha256: createHash('sha256').update(xml).digest('hex'),
  xmlSizeBytes: Buffer.byteLength(xml),
  productCount: 1,
  warehousePolicy: '10000-10007',
}

describe('stock reconciliation manifest', () => {
  it('accepts source runStartedAt bound to the exact XML', () => {
    expect(verifyStockReconciliationManifest(xml, JSON.stringify(base), new Date('2026-10-12T11:00:00Z'))).toMatchObject({
      verdict: 'PASS', runStartedAt: base.runStartedAt,
    })
  })

  it('rejects generatedAt-only manifests and impossible source ordering', () => {
    const { runStartedAt: _omitted, ...withoutStart } = base
    expect(verifyStockReconciliationManifest(xml, JSON.stringify(withoutStart), new Date('2026-10-12T11:00:00Z')).failures)
      .toContain('manifest runStartedAt is required for stock reconciliation')
    expect(verifyStockReconciliationManifest(xml, JSON.stringify({ ...base, runStartedAt: '2026-10-12T10:02:00Z' }), new Date('2026-10-12T11:00:00Z')).failures)
      .toContain('manifest runStartedAt is after generatedAt')
  })

  it('rejects a manifest from another XML', () => {
    expect(verifyStockReconciliationManifest(`${xml} `, JSON.stringify(base), new Date('2026-10-12T11:00:00Z')).failures)
      .toContain('manifest xmlSha256 does not match the downloaded export.xml')
  })
})
