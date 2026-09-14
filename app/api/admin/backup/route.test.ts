import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { requireAdminMock, createMock, validateMock, restoreMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(), createMock: vi.fn(), validateMock: vi.fn(), restoreMock: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/configuration-backup', () => ({
  createConfigurationBackup: createMock, validateConfigurationBackup: validateMock, restoreConfigurationBackup: restoreMock,
}))
import { GET, POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1' })
  createMock.mockResolvedValue({ kind: 'configuration-backup', version: 1, createdAt: '2026-09-14T00:00:00.000Z', files: {}, manifest: {} })
  restoreMock.mockResolvedValue(['site-content.json'])
})

describe('configuration backup API', () => {
  it('rejects unauthenticated access', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('downloads a non-cacheable versioned backup', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('Content-Disposition')).toContain('configuration-backup-2026-09-14.json')
  })

  it('requires the exact restore confirmation', async () => {
    const request = new NextRequest('http://localhost/api/admin/backup', { method: 'POST', body: JSON.stringify({ backup: {}, confirmation: 'restore' }) })
    expect((await POST(request)).status).toBe(400)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('validates and restores an accepted backup', async () => {
    const backup = { kind: 'configuration-backup' }
    const request = new NextRequest('http://localhost/api/admin/backup', { method: 'POST', body: JSON.stringify({ backup, confirmation: 'RESTORE CONFIGURATION' }) })
    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(validateMock).toHaveBeenCalledWith(backup)
    expect(restoreMock).toHaveBeenCalledWith(backup)
  })

  it('rejects oversized requests', async () => {
    const request = new NextRequest('http://localhost/api/admin/backup', { method: 'POST', headers: { 'content-length': String(21 * 1024 * 1024) }, body: '{}' })
    expect((await POST(request)).status).toBe(413)
  })
})
