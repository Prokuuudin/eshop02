import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server-auth', () => ({ getStaffSessionStatus: vi.fn() }))

import { getStaffSessionStatus } from '@/lib/server-auth'
import { POST } from './route'

describe('POST /api/auth/session (staff presence heartbeat)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirms a live staff session and returns its 8-hour deadline, uncached', async () => {
    vi.mocked(getStaffSessionStatus).mockResolvedValue({ absoluteExpiresAt: new Date('2026-11-13T16:00:00.000Z') })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, absoluteExpiresAt: '2026-11-13T16:00:00.000Z' })
  })

  it('answers 401 once the session has ended (8 hours, browser closed, logged out, or not staff)', async () => {
    vi.mocked(getStaffSessionStatus).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'session_expired' })
  })
})
