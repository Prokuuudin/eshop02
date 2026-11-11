import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  getAdminDashboardPrefs: vi.fn(),
  saveAdminDashboardPrefs: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: h.requireAdminPermission }))
vi.mock('@/lib/admin-dashboard-prefs-server-store', () => ({
  getAdminDashboardPrefs: h.getAdminDashboardPrefs,
  saveAdminDashboardPrefs: h.saveAdminDashboardPrefs,
}))

import { GET, PUT } from './route'

const ACTOR = { id: 'admin-1', email: 'admin@test.com' }

function put(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/dashboard-prefs', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireAdminPermission.mockResolvedValue(ACTOR)
  h.getAdminDashboardPrefs.mockResolvedValue({ cardOrder: null, favoriteCardIds: [] })
  h.saveAdminDashboardPrefs.mockImplementation(async (_userId: string, input: object) => ({ cardOrder: null, favoriteCardIds: [], ...input }))
})

describe('/api/admin/dashboard-prefs', () => {
  it('requires admin.access for reading and writing', async () => {
    h.requireAdminPermission.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await GET()).status).toBe(403)
    expect((await PUT(put({ cardOrder: ['a'] }))).status).toBe(403)
    expect(h.requireAdminPermission).toHaveBeenCalledWith('admin.access')
    expect(h.saveAdminDashboardPrefs).not.toHaveBeenCalled()
  })

  it('reads the session user preferences', async () => {
    expect(await (await GET()).json()).toEqual({ cardOrder: null, favoriteCardIds: [] })
    expect(h.getAdminDashboardPrefs).toHaveBeenCalledWith('admin-1')
  })

  it('binds the update to the session user and passes the audit context', async () => {
    const request = put({ favoriteCardIds: ['orders'] })
    const res = await PUT(request)
    expect(await res.json()).toEqual({ cardOrder: null, favoriteCardIds: ['orders'] })
    expect(h.saveAdminDashboardPrefs).toHaveBeenCalledWith('admin-1', { favoriteCardIds: ['orders'] }, { actor: ACTOR, request })
  })

  it('keeps 400 failed_to_save_dashboard_prefs for malformed JSON without saving', async () => {
    const res = await PUT(put('{'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'failed_to_save_dashboard_prefs' })
    expect(h.saveAdminDashboardPrefs).not.toHaveBeenCalled()
  })

  it('keeps 400 when saving or its audit fails', async () => {
    h.saveAdminDashboardPrefs.mockRejectedValue(new Error('audit unavailable'))
    const res = await PUT(put({ cardOrder: ['a'] }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'failed_to_save_dashboard_prefs' })
  })
})
