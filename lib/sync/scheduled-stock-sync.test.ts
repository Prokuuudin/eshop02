import { describe, expect, it, vi } from 'vitest'
import { runScheduledStockSync } from './scheduled-stock-sync'
import { MANUAL_IMPORT_MAX_BYTES } from './manual-import'

describe('scheduled stock sync feature gates', () => {
  it('touches neither DB nor FTPS while disabled', async () => {
    const getDb = vi.fn()
    const downloadXml = vi.fn()
    const result = await runScheduledStockSync({
      env: {},
      getDb,
      downloadXml,
      downloadManifest: vi.fn(),
      sendAlert: vi.fn(),
    })
    expect(result).toEqual({ status: 'disabled', exitCode: 0 })
    expect(getDb).not.toHaveBeenCalled()
    expect(downloadXml).not.toHaveBeenCalled()
  })

  it('fails closed when scheduled sync is enabled without the ledger', async () => {
    const result = await runScheduledStockSync({
      env: { GRINS_STOCK_SYNC_ENABLED: 'true' },
      getDb: vi.fn(), downloadXml: vi.fn(), downloadManifest: vi.fn(), sendAlert: vi.fn(),
    })
    expect(result).toMatchObject({ status: 'failed', exitCode: 1, reason: 'stock_sync_requires_ledger' })
  })

  it('rejects an oversized FTPS XML before parsing or applying it', async () => {
    const sendAlert = vi.fn()
    const db = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      syncRun: { create: vi.fn().mockResolvedValue({ id: 'failed-run' }) },
    }
    const result = await runScheduledStockSync({
      env: { GRINS_STOCK_LEDGER_ENABLED: 'true', GRINS_STOCK_SYNC_ENABLED: 'true' },
      getDb: vi.fn().mockResolvedValue(db),
      downloadXml: vi.fn().mockResolvedValue({ content: '<root/>', remoteSizeBytes: MANUAL_IMPORT_MAX_BYTES + 1 }),
      downloadManifest: vi.fn(),
      sendAlert,
    } as never)

    expect(result).toMatchObject({ status: 'failed', exitCode: 1, reason: 'FTPS XML exceeds the configured import size limit' })
    expect(sendAlert).toHaveBeenCalledOnce()
  })
})
