import { createHash } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The orchestration is under test; the ledger write and the preflight have their own suites.
const applyStockSnapshot = vi.hoisted(() => vi.fn())
vi.mock('./stock-snapshot', () => ({ applyStockSnapshot }))
vi.mock('./stock-sync-preflight', () => ({ evaluateStockSyncPreflight: () => ({ hard: [], warnings: [], metrics: {} }) }))

import { runScheduledStockSync } from './scheduled-stock-sync'
import type { RunFilesSelection } from './ftps-run-files'

const RUN = '20261017T150000000000Z-4242'
const NOW = new Date('2026-10-17T16:00:00Z')
const ENV = {
  GRINS_STOCK_LEDGER_ENABLED: 'true',
  GRINS_STOCK_SYNC_ENABLED: 'true',
  GRINS_STOCK_MANIFEST_ENABLED: 'true',
  GRINS_FTPS_SOURCE_LAYOUT: 'run-files',
  GRINS_FTPS_REMOTE_DIR: '/grins-feed',
}
const SELECTION: RunFilesSelection = {
  runId: RUN,
  xmlName: `export-${RUN}.xml`,
  manifestName: `export-${RUN}.manifest.json`,
  xmlPath: `/grins-feed/export-${RUN}.xml`,
  manifestPath: `/grins-feed/export-${RUN}.manifest.json`,
}
const warehouses = Array.from({ length: 9 }, (_, i) => `<warehouse id="${i + 1}">${i === 0 ? 3 : 0}</warehouse>`).join('')
const XML = `<?xml version="1.0" encoding="utf-8"?><root><item><sku>A1</sku><code /><title>t</title><price1>10</price1><price2>8</price2><price3>0</price3><price4>0</price4><quantity>3</quantity><warehouses>${warehouses}</warehouses></item></root>`
const SHA = createHash('sha256').update(XML, 'utf-8').digest('hex')

function manifest(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1, runId: RUN, xmlFileName: `export-${RUN}.xml`, xmlSha256: SHA, xmlSizeBytes: Buffer.byteLength(XML, 'utf-8'),
    productCount: 1, warehousePolicy: '10000-10007', runStartedAt: '2026-10-17T15:00:00Z', generatedAt: '2026-10-17T15:00:42Z', ...over,
  })
}

function setup(over: { env?: Record<string, string>; manifestText?: string; resolve?: () => Promise<RunFilesSelection>; noResolver?: boolean } = {}) {
  const db = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    product: { findMany: vi.fn().mockResolvedValue([]) },
    syncRun: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'failed-run' }) },
  }
  const deps = {
    env: { ...ENV, ...over.env },
    getDb: vi.fn().mockResolvedValue(db),
    downloadXml: vi.fn().mockResolvedValue({ content: XML }),
    downloadManifest: vi.fn().mockResolvedValue({ content: over.manifestText ?? manifest() }),
    ...(over.noResolver ? {} : { resolveRunFiles: vi.fn(over.resolve ?? (async () => SELECTION)) }),
    sendAlert: vi.fn().mockResolvedValue('sent'),
    now: () => NOW,
  }
  return { db, deps }
}

describe('scheduled stock sync — run-files source layout', () => {
  beforeEach(() => {
    applyStockSnapshot.mockReset()
    applyStockSnapshot.mockResolvedValue({ runId: 'stock-run', status: 'completed', matched: 1, reconciled: 0, awaiting: 0 })
  })

  it('reads the selected pair and applies it with the manifest identity', async () => {
    const { deps } = setup()
    const result = await runScheduledStockSync(deps as never)
    expect(result).toEqual({ status: 'completed', runId: 'stock-run', exitCode: 0 })
    expect(deps.downloadXml).toHaveBeenCalledWith(SELECTION.xmlPath)
    expect(deps.downloadManifest).toHaveBeenCalledWith(SELECTION.manifestPath)
    const source = applyStockSnapshot.mock.calls[0][2]
    expect(source).toMatchObject({ identity: `manifest:2026-10-17T15:00:00.000Z:${SHA}`, sha256: SHA, manifestVerified: true })
    expect(source.runStartedAt.toISOString()).toBe('2026-10-17T15:00:00.000Z')
    expect(deps.sendAlert).not.toHaveBeenCalled()
  })

  it('requires the manifest flag: run files have no MDTM ordering', async () => {
    const { deps } = setup({ env: { GRINS_STOCK_MANIFEST_ENABLED: 'false' } })
    const result = await runScheduledStockSync(deps as never)
    expect(result).toMatchObject({ status: 'failed', reason: 'run-files source layout requires GRINS_STOCK_MANIFEST_ENABLED=true' })
    expect(deps.resolveRunFiles).not.toHaveBeenCalled()
    expect(deps.downloadXml).not.toHaveBeenCalled()
    expect(deps.sendAlert).toHaveBeenCalledOnce()
  })

  it('fails closed without a resolver, without a complete pair, or on an unknown layout', async () => {
    for (const [over, reason] of [
      [{ noResolver: true }, 'run-files source layout has no directory resolver'],
      [{ resolve: async () => { throw new Error('no_complete_export') } }, 'FTPS run-files selection failed: no_complete_export'],
      [{ env: { GRINS_FTPS_SOURCE_LAYOUT: 'latest' } }, 'FTPS run-files selection failed: GRINS_FTPS_SOURCE_LAYOUT must be one of fixed, run-files'],
    ] as const) {
      const { deps } = setup(over as never)
      expect(await runScheduledStockSync(deps as never)).toMatchObject({ status: 'failed', exitCode: 1, reason })
      expect(deps.downloadXml).not.toHaveBeenCalled()
      expect(deps.sendAlert).toHaveBeenCalledOnce()
    }
    expect(applyStockSnapshot).not.toHaveBeenCalled()
  })

  it('rejects a manifest that names another run or XML file', async () => {
    for (const over of [{ runId: '20261017T140000000000Z-1' }, { xmlFileName: 'export.xml' }]) {
      const { deps } = setup({ manifestText: manifest(over) })
      const result = await runScheduledStockSync(deps as never)
      expect(result).toMatchObject({ status: 'failed', reason: 'run-files manifest does not describe the selected pair' })
    }
    expect(applyStockSnapshot).not.toHaveBeenCalled()
  })

  it('keeps the existing SHA, size and freshness checks', async () => {
    for (const over of [{ xmlSha256: 'f'.repeat(64) }, { xmlSizeBytes: 1 }, { generatedAt: '2026-10-17T10:00:00Z', runStartedAt: '2026-10-17T09:59:00Z' }, { warehousePolicy: '10000-10010' }]) {
      const { deps } = setup({ manifestText: manifest(over) })
      expect(await runScheduledStockSync(deps as never)).toMatchObject({ status: 'failed', reason: 'stock manifest verification failed' })
    }
    expect(applyStockSnapshot).not.toHaveBeenCalled()
  })

  it('keeps replay and stale-snapshot protection of the ledger', async () => {
    applyStockSnapshot.mockResolvedValueOnce({ runId: 'r1', status: 'skipped', reason: 'snapshot_replay', matched: 0, reconciled: 0, awaiting: 0 })
    const replay = setup()
    expect(await runScheduledStockSync(replay.deps as never)).toEqual({ status: 'skipped', runId: 'r1', exitCode: 0, reason: 'snapshot_replay' })

    applyStockSnapshot.mockResolvedValueOnce({ runId: 'r2', status: 'failed', reason: 'stock_snapshot_older_than_last_manifest_snapshot', matched: 0, reconciled: 0, awaiting: 0 })
    const older = setup()
    expect(await runScheduledStockSync(older.deps as never)).toMatchObject({ status: 'failed', reason: 'stock_snapshot_older_than_last_manifest_snapshot' })
    expect(older.deps.sendAlert).toHaveBeenCalledOnce()
  })

  it('leaves the fixed layout untouched: no resolver call, configured paths', async () => {
    const { deps } = setup({ env: { GRINS_FTPS_SOURCE_LAYOUT: '', GRINS_FTPS_REMOTE_PATH: 'feed/export.xml' }, manifestText: manifest({ xmlFileName: 'export.xml' }) })
    const result = await runScheduledStockSync(deps as never)
    expect(result).toMatchObject({ status: 'completed' })
    expect(deps.resolveRunFiles).not.toHaveBeenCalled()
    expect(deps.downloadXml).toHaveBeenCalledWith()
    expect(deps.downloadManifest).toHaveBeenCalledWith('feed/export.manifest.json')
  })
})
