import { beforeEach, describe, expect, it, vi } from 'vitest'

const isSyncLockHeldMock = vi.hoisted(() => vi.fn())
const loadPreflightStateMock = vi.hoisted(() => vi.fn())
const evaluatePreflightMock = vi.hoisted(() => vi.fn())
const auditGrinsXmlMock = vi.hoisted(() => vi.fn())
const parseGrinsXmlMock = vi.hoisted(() => vi.fn())

vi.mock('./sync-lock', () => ({ isSyncLockHeld: isSyncLockHeldMock }))
vi.mock('./sync-preflight', () => ({ loadPreflightState: loadPreflightStateMock, evaluatePreflight: evaluatePreflightMock }))
vi.mock('./grins-xml-parser', () => ({ auditGrinsXml: auditGrinsXmlMock, parseGrinsXml: parseGrinsXmlMock }))

import { runScheduledSync, type ScheduledSyncDeps } from './scheduled-sync'
import { sendSyncFailureAlert } from './sync-alert'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const PRODUCTS = [{ externalId: 'e1', title: 'e1', price: 10, stock: 1 }]
const PASS = { hard: [], warnings: ['feed size drift 3%'], metrics: { rows: 1, linked: 1 } }

function makeDb() {
  return {
    syncRun: { create: vi.fn().mockResolvedValue({ id: 'sched-1' }) },
    product: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  }
}

function makeDeps(overrides: Partial<ScheduledSyncDeps> = {}) {
  const db = makeDb()
  const deps = {
    env: { SYNC_PULL_ENABLED: 'true', SYNC_ALERT_EMAIL: 'ops@example.test' } as unknown as NodeJS.ProcessEnv,
    getDb: vi.fn().mockResolvedValue(db as unknown as ExtendedPrismaClient),
    download: vi.fn().mockResolvedValue({ content: '<root/>', modifiedAt: '2026-09-28T10:00:00.000Z' }),
    runSync: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'completed', productsSynced: 1, deactivated: 0, errorCount: 0 }),
    sendAlert: vi.fn().mockResolvedValue('sent'),
    ...overrides,
  }
  return { deps: deps as ScheduledSyncDeps & typeof deps, db }
}

beforeEach(() => {
  vi.clearAllMocks()
  isSyncLockHeldMock.mockResolvedValue(false)
  loadPreflightStateMock.mockResolvedValue({ linkedProducts: [], previousProductsTotal: 1 })
  evaluatePreflightMock.mockReturnValue(PASS)
  auditGrinsXmlMock.mockReturnValue({ validXml: true, itemCount: 1 })
  parseGrinsXmlMock.mockReturnValue(PRODUCTS)
})

describe('runScheduledSync — kill switch', () => {
  it.each([undefined, 'false', 'TRUE', '1', ''])('does nothing and exits 0 when SYNC_PULL_ENABLED=%s', async value => {
    const { deps } = makeDeps({ env: { SYNC_PULL_ENABLED: value } as unknown as NodeJS.ProcessEnv })
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'disabled', exitCode: 0 })
    expect(deps.getDb).not.toHaveBeenCalled()
    expect(deps.download).not.toHaveBeenCalled()
    expect(deps.runSync).not.toHaveBeenCalled()
    expect(deps.sendAlert).not.toHaveBeenCalled()
  })
})

describe('runScheduledSync — happy path and lock', () => {
  it('runs the existing runSync as cron with the parsed feed and diagnostics', async () => {
    const { deps, db } = makeDeps()
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'completed', runId: 'run-1', exitCode: 0 })
    expect(deps.runSync).toHaveBeenCalledWith(expect.objectContaining({ name: 'grins-xml-scheduled' }), db, 'cron', {
      diagnostics: expect.objectContaining({ kind: 'scheduled-full-sync', xmlSha256: expect.stringMatching(/^[0-9a-f]{64}$/u), warnings: PASS.warnings }),
    })
    const adapter = (deps.runSync as ReturnType<typeof vi.fn>).mock.calls[0][0]
    await expect(adapter.fetchPage()).resolves.toEqual({ products: PRODUCTS, hasMore: false })
    expect(deps.sendAlert).not.toHaveBeenCalled()
    expect(db.syncRun.create).not.toHaveBeenCalled()
  })

  it('records skipped without downloading or alerting when the lock is already held', async () => {
    isSyncLockHeldMock.mockResolvedValue(true)
    const { deps, db } = makeDeps()
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'skipped', runId: 'sched-1', exitCode: 0 })
    expect(db.syncRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'skipped', triggeredBy: 'cron', errorSample: { reason: 'already_running' } }) })
    expect(deps.download).not.toHaveBeenCalled()
    expect(deps.runSync).not.toHaveBeenCalled()
    expect(deps.sendAlert).not.toHaveBeenCalled()
  })

  it('exits 0 without alert when runSync itself loses the lock race (skipped)', async () => {
    const { deps } = makeDeps({ runSync: vi.fn().mockResolvedValue({ runId: 'run-2', status: 'skipped', productsSynced: 0, deactivated: 0, errorCount: 0, reason: 'already_running' }) })
    expect(await runScheduledSync(deps)).toEqual({ status: 'skipped', runId: 'run-2', exitCode: 0 })
    expect(deps.sendAlert).not.toHaveBeenCalled()
  })
})

describe('runScheduledSync — failures', () => {
  it('FTPS failure → failed SyncRun, alert attempt, no sync', async () => {
    const { deps, db } = makeDeps({ download: vi.fn().mockRejectedValue(new Error('connect ETIMEDOUT')) })
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'failed', runId: 'sched-1', exitCode: 1 })
    expect(db.syncRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'failed', triggeredBy: 'cron', errorSample: expect.objectContaining({ stage: 'download', fatal: 'FTPS download failed: connect ETIMEDOUT' }),
    }) })
    expect(deps.runSync).not.toHaveBeenCalled()
    expect(deps.sendAlert).toHaveBeenCalledWith(expect.objectContaining({ runId: 'sched-1', reason: 'FTPS download failed: connect ETIMEDOUT' }))
  })

  it('preflight HARD failure → failed before any Product write', async () => {
    evaluatePreflightMock.mockReturnValue({ hard: ['linked ratio 50.00% < 90.00%'], warnings: [], metrics: { rows: 1 } })
    const { deps, db } = makeDeps()
    const outcome = await runScheduledSync(deps)
    expect(outcome.status).toBe('failed')
    expect(deps.runSync).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.product.updateMany).not.toHaveBeenCalled()
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled()
    expect(db.syncRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      errorSample: expect.objectContaining({ stage: 'preflight', hardFailures: ['linked ratio 50.00% < 90.00%'], xmlSha256: expect.any(String) }),
    }) })
    expect(deps.sendAlert).toHaveBeenCalledWith(expect.objectContaining({ hardFailures: ['linked ratio 50.00% < 90.00%'] }))
  })

  it('DB unavailable before sync → failed + alert even though the SyncRun cannot be recorded', async () => {
    isSyncLockHeldMock.mockRejectedValue(new Error('Connection terminated'))
    const { deps, db } = makeDeps()
    db.syncRun.create.mockRejectedValue(new Error('Connection terminated'))
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'failed', runId: undefined, exitCode: 1 })
    expect(deps.sendAlert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'database unavailable before sync: Connection terminated' }))
  })

  it('DB batch error inside runSync → failed + alert with the runSync reason', async () => {
    const { deps } = makeDeps({ runSync: vi.fn().mockResolvedValue({ runId: 'run-3', status: 'failed', productsSynced: 200, deactivated: 0, errorCount: 1 }) })
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'failed', runId: 'run-3', exitCode: 1 })
    expect(deps.sendAlert).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-3', reason: '1 batch error(s); see SyncRun.errorSample' }))
  })

  it('a mailer failure does not hide the original sync failure', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP down'))
    const env = { SYNC_PULL_ENABLED: 'true', SYNC_ALERT_EMAIL: 'ops@example.test' } as unknown as NodeJS.ProcessEnv
    const { deps } = makeDeps({
      env,
      runSync: vi.fn().mockResolvedValue({ runId: 'run-4', status: 'failed', productsSynced: 0, deactivated: 0, errorCount: 1, fatal: 'Sync lock ownership lost' }),
      sendAlert: alert => sendSyncFailureAlert(alert, { env, sendEmail }),
    })
    const outcome = await runScheduledSync(deps)
    expect(outcome).toEqual({ status: 'failed', runId: 'run-4', exitCode: 1 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('missing SYNC_ALERT_EMAIL → still failed, alert skipped', async () => {
    const sendEmail = vi.fn()
    const env = { SYNC_PULL_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv
    const { deps } = makeDeps({
      env,
      download: vi.fn().mockRejectedValue(new Error('530 Login incorrect')),
      sendAlert: alert => sendSyncFailureAlert(alert, { env, sendEmail }),
    })
    const outcome = await runScheduledSync(deps)
    expect(outcome.status).toBe('failed')
    expect(outcome.exitCode).toBe(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
