import { createHash } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  compareLocalStockSafety,
  runLocalFileStockSync,
  verifyLocalStockSource,
  type LocalStockSafetySnapshot,
  type LocalStockSource,
} from './local-stock-sync'

const now = new Date('2026-10-16T10:00:00Z')
const xml = '<?xml version="1.0" encoding="utf-8"?><root><item><sku>A</sku><price1>10</price1><price2>8</price2><price3>0</price3><price4>0</price4><quantity>4</quantity><warehouses><warehouse id="1">4</warehouse><warehouse id="2">0</warehouse><warehouse id="3">0</warehouse><warehouse id="4">0</warehouse><warehouse id="5">0</warehouse><warehouse id="6">0</warehouse><warehouse id="7">0</warehouse><warehouse id="8">0</warehouse><warehouse id="9">0</warehouse></warehouses></item></root>'
const sha256 = createHash('sha256').update(xml, 'utf-8').digest('hex')

function source(overrides: Record<string, unknown> = {}): LocalStockSource {
  return {
    xml,
    expectedRunId: '20261016T090000000000Z-1',
    expectedSha256: sha256,
    manifest: JSON.stringify({
      schemaVersion: 1,
      mode: 'shadow',
      published: false,
      runId: '20261016T090000000000Z-1',
      runStartedAt: '2026-10-16T09:00:00Z',
      generatedAt: '2026-10-16T09:01:00Z',
      xmlSha256: sha256,
      xmlSizeBytes: Buffer.byteLength(xml, 'utf-8'),
      productCount: 1,
      warehousePolicy: '10000-10007',
      ...overrides,
    }),
  }
}

const safety = (overrides: Partial<LocalStockSafetySnapshot> = {}): LocalStockSafetySnapshot => ({
  productCount: 10,
  catalogMetadataFingerprint: 'catalog',
  erpMetadataFingerprint: 'erp',
  allocationCount: 2,
  allocationFingerprint: 'allocations',
  orderCount: 1,
  orderFingerprint: 'orders',
  ...overrides,
})

describe('local-file stocks-only adapter', () => {
  it('accepts only a fresh, unpublished shadow manifest bound to the exact run and XML', () => {
    expect(() => verifyLocalStockSource(source(), now)).not.toThrow()
    expect(() => verifyLocalStockSource(source({ mode: 'publish' }), now)).toThrow('local_stock_manifest_requires_shadow_mode')
    expect(() => verifyLocalStockSource(source({ published: true }), now)).toThrow('local_stock_manifest_must_be_unpublished')
    expect(() => verifyLocalStockSource(source({ generatedAt: '2026-10-16T05:00:00Z' }), now)).toThrow(/stale/u)
  })

  it('rejects a bad source before requesting a database client', async () => {
    const getDb = vi.fn()
    await expect(runLocalFileStockSync({
      source: source({ mode: 'apply' }),
      getDb,
      verifyTarget: vi.fn(),
    })).rejects.toThrow('local_stock_manifest_requires_shadow_mode')
    expect(getDb).not.toHaveBeenCalled()
  })

  it('uses only stocks-only manual orchestration and preserves catalog, ERP metadata, reservations and orders', async () => {
    const db = {} as never
    const verifyTarget = vi.fn().mockResolvedValue(undefined)
    const captureSafety = vi.fn().mockResolvedValueOnce(safety()).mockResolvedValueOnce(safety())
    const runStockSync = vi.fn().mockImplementation(async (deps) => {
      expect(deps.sourceLabel).toBe('local file')
      expect(deps.triggeredBy).toBe('manual')
      expect(deps.env).toMatchObject({
        GRINS_STOCK_LEDGER_ENABLED: 'true',
        GRINS_STOCK_SYNC_ENABLED: 'true',
        GRINS_STOCK_MANIFEST_ENABLED: 'true',
        GRINS_STOCK_RECONCILIATION_ENABLED: 'false',
      })
      expect((await deps.downloadXml()).content).toBe(xml)
      expect((await deps.downloadManifest('ignored')).content).toBe(source().manifest)
      await deps.verifyTarget(db)
      return { status: 'completed', runId: 'stock-run', exitCode: 0 as const }
    })

    const result = await runLocalFileStockSync({
      source: source(),
      now: () => now,
      getDb: async () => db,
      verifyTarget,
      captureSafety,
      runStockSync,
    })

    expect(result).toEqual({
      sync: { status: 'completed', runId: 'stock-run', exitCode: 0 },
      safety: {
        updateOnly: true,
        catalogMetadataUnchanged: true,
        erpMetadataUnchanged: true,
        reservationsUnchanged: true,
        ordersUnchanged: true,
        passed: true,
      },
    })
    expect(verifyTarget).toHaveBeenCalledTimes(2)
  })

  it('binds the source to the exact XML bytes and run', () => {
    expect(() => verifyLocalStockSource({ ...source(), expectedSha256: 'not-a-sha' }, now)).toThrow('local_stock_expected_sha256_invalid')
    expect(() => verifyLocalStockSource({ ...source(), expectedSha256: 'f'.repeat(64) }, now)).toThrow('local_stock_xml_sha256_mismatch')
    expect(() => verifyLocalStockSource({ ...source(), expectedRunId: 'other-run' }, now)).toThrow('local_stock_manifest_run_id_mismatch')
    expect(() => verifyLocalStockSource({ ...source(), manifest: '{' }, now)).toThrow('local_stock_manifest_invalid_json')
    // The real exporter manifest has no `published` field; only an explicit non-false value is rejected.
    expect(() => verifyLocalStockSource(source({ published: undefined }), now)).not.toThrow()
    expect(() => verifyLocalStockSource(source({ published: 'false' }), now)).toThrow('local_stock_manifest_must_be_unpublished')
  })

  it('rejects a wrong target before capturing state or running the sync', async () => {
    const captureSafety = vi.fn()
    const runStockSync = vi.fn()
    await expect(runLocalFileStockSync({
      source: source(),
      now: () => now,
      getDb: async () => ({}) as never,
      verifyTarget: vi.fn().mockRejectedValue(new Error('local_stock_rehearsal_checkout_must_be_closed')),
      captureSafety,
      runStockSync,
    })).rejects.toThrow('local_stock_rehearsal_checkout_must_be_closed')
    expect(captureSafety).not.toHaveBeenCalled()
    expect(runStockSync).not.toHaveBeenCalled()
  })

  it('reports a failed safety check when the run changed protected state', async () => {
    const result = await runLocalFileStockSync({
      source: source(),
      now: () => now,
      getDb: async () => ({}) as never,
      verifyTarget: vi.fn().mockResolvedValue(undefined),
      captureSafety: vi.fn().mockResolvedValueOnce(safety()).mockResolvedValueOnce(safety({ orderFingerprint: 'changed' })),
      runStockSync: vi.fn().mockResolvedValue({ status: 'completed', runId: 'stock-run', exitCode: 0 }),
    })
    expect(result.safety).toMatchObject({ ordersUnchanged: false, passed: false })
  })

  it('detects any non-stock side effect', () => {
    expect(compareLocalStockSafety(safety(), safety({ productCount: 11 }))).toMatchObject({ updateOnly: false, passed: false })
    expect(compareLocalStockSafety(safety(), safety({ erpMetadataFingerprint: 'changed' }))).toMatchObject({
      erpMetadataUnchanged: false,
      passed: false,
    })
    expect(compareLocalStockSafety(safety(), safety({ orderCount: 2 }))).toMatchObject({ ordersUnchanged: false, passed: false })
    expect(compareLocalStockSafety(safety(), safety({ catalogMetadataFingerprint: 'changed' }))).toMatchObject({
      catalogMetadataUnchanged: false,
      passed: false,
    })
    expect(compareLocalStockSafety(safety(), safety({ allocationFingerprint: 'changed' }))).toMatchObject({
      reservationsUnchanged: false,
      passed: false,
    })
  })
})
