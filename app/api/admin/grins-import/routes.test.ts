import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})),
    syncRun: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/sync/sync-runner', () => ({ runSync: vi.fn() }))
vi.mock('@/lib/sync/sync-lock', () => ({ isSyncLockHeld: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/sync/manual-import', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sync/manual-import')>(),
  evaluateFeed: vi.fn(),
  savePendingPreview: vi.fn(),
  applyManualImport: vi.fn(),
}))

import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { applyManualImport, evaluateFeed, savePendingPreview } from '@/lib/sync/manual-import'
import { POST as previewPOST } from './preview/route'
import { POST as applyPOST } from './apply/route'
import { GET as historyGET } from './history/route'

const admin = { id: 'admin-1', email: 'admin@test' } as never
const allow = () => vi.mocked(requireAdminPermission).mockResolvedValue(admin)

const uploadRequest = (name: string, content: string) => {
  const form = new FormData()
  form.append('file', new File([content], name, { type: 'text/xml' }))
  return new NextRequest('https://shop.test/api/admin/grins-import/preview', { method: 'POST', body: form })
}
const applyRequest = (body: unknown) =>
  new NextRequest('https://shop.test/api/admin/grins-import/apply', { method: 'POST', body: JSON.stringify(body) })
const validApply = { previewId: '123e4567-e89b-42d3-a456-426614174000', sha256: 'a'.repeat(64) }

describe('GrinS manual import routes — authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['preview', () => previewPOST(uploadRequest('export.xml', '<root/>'))],
    ['apply', () => applyPOST(applyRequest(validApply))],
    ['history', () => historyGET()],
  ])('%s: anonymous user gets 401 and nothing is evaluated or applied', async (_name, call) => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }))
    expect((await call()).status).toBe(401)
    expect(evaluateFeed).not.toHaveBeenCalled()
    expect(applyManualImport).not.toHaveBeenCalled()
  })

  it.each([
    ['preview', () => previewPOST(uploadRequest('export.xml', '<root/>'))],
    ['apply', () => applyPOST(applyRequest(validApply))],
  ])('%s: catalog.update without prices.update gets 403', async (_name, call) => {
    vi.mocked(requireAdminPermission).mockImplementation(async permission =>
      permission === 'prices.update' ? NextResponse.json({ error: 'forbidden' }, { status: 403 }) : admin)
    expect((await call()).status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('catalog.update')
    expect(requireAdminPermission).toHaveBeenCalledWith('prices.update')
    expect(evaluateFeed).not.toHaveBeenCalled()
    expect(applyManualImport).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/grins-import/preview', () => {
  beforeEach(() => { vi.clearAllMocks(); allow() })

  it('rejects a non-XML file before parsing', async () => {
    const res = await previewPOST(uploadRequest('export.csv', 'a,b'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'not_xml_file' })
    expect(evaluateFeed).not.toHaveBeenCalled()
  })

  it('rejects a DTD/entity payload before parsing', async () => {
    const res = await previewPOST(uploadRequest('export.xml', '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><root>&x;</root>'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'forbidden_xml_construct' })
  })

  it('does not store an applicable preview when HARD checks fail', async () => {
    vi.mocked(evaluateFeed).mockResolvedValue({ preflight: { hard: ['invalid XML: x'], warnings: [], metrics: {} }, summary: {}, samples: {} } as never)
    const res = await previewPOST(uploadRequest('export.xml', '<root><item>'))
    const body = await res.json()
    expect(body).toMatchObject({ canApply: false, previewId: null, hard: ['invalid XML: x'] })
    expect(savePendingPreview).not.toHaveBeenCalled()
    expect(appendServerAudit).toHaveBeenCalledTimes(1)
  })

  it('stores the snapshot and returns previewId + SHA when checks pass', async () => {
    vi.mocked(evaluateFeed).mockResolvedValue({ preflight: { hard: [], warnings: ['w'], metrics: {} }, summary: { rows: 1 }, samples: {} } as never)
    vi.mocked(savePendingPreview).mockResolvedValue({ previewId: 'pv-1', expiresAt: '2026-10-08T12:30:00.000Z' } as never)
    const res = await previewPOST(uploadRequest('export.xml', '<root/>'))
    const body = await res.json()
    expect(body).toMatchObject({ canApply: true, previewId: 'pv-1', warnings: ['w'] })
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(savePendingPreview).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: 'admin-1', sha256: body.sha256 }))
  })
})

describe('POST /api/admin/grins-import/apply', () => {
  beforeEach(() => { vi.clearAllMocks(); allow() })

  it.each([
    [{}],
    [{ previewId: 'x', sha256: 'a'.repeat(64) }],
    [{ previewId: validApply.previewId, sha256: 'not-a-sha' }],
  ])('rejects malformed input %j', async body => {
    expect((await applyPOST(applyRequest(body))).status).toBe(400)
    expect(applyManualImport).not.toHaveBeenCalled()
  })

  it('maps a concurrent sync to 409 and records the rejection in the audit log', async () => {
    vi.mocked(applyManualImport).mockResolvedValue({ status: 'rejected', error: 'sync_running' })
    const res = await applyPOST(applyRequest(validApply))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'sync_running' })
    expect(appendServerAudit).toHaveBeenCalledWith(expect.anything(), expect.anything(), admin, expect.objectContaining({ action: 'catalog.grins_import_rejected' }))
  })

  it('never reports success for a failed run', async () => {
    vi.mocked(applyManualImport).mockResolvedValue({
      status: 'failed', backupKey: 'grins-manual-import-backup:x', fileName: 'export.xml', sha256: validApply.sha256,
      result: { runId: 'run-9', status: 'failed', productsSynced: 200, deactivated: 0, errorCount: 1 },
    })
    const res = await applyPOST(applyRequest(validApply))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ status: 'failed', runId: 'run-9', backupKey: 'grins-manual-import-backup:x' })
  })

  it('returns the run id on success with the actor bound to the apply', async () => {
    vi.mocked(applyManualImport).mockResolvedValue({
      status: 'completed', backupKey: 'k', fileName: 'export.xml', sha256: validApply.sha256,
      result: { runId: 'run-1', status: 'completed', productsSynced: 15754, deactivated: 0, errorCount: 0 },
    })
    const res = await applyPOST(applyRequest(validApply))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'completed', runId: 'run-1', productsSynced: 15754 })
    expect(applyManualImport).toHaveBeenCalledWith(expect.anything(), { ...validApply, actorId: 'admin-1' })
  })
})
