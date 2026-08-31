import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a session that still requires a password change to be identified', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', mustChangePassword: true } as never)
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ user: { id: 'u1' } })
    expect(getServerUser).toHaveBeenCalledWith({ allowPasswordChangeRequired: true })
  })

  it('fails closed to a null user when session lookup throws', async () => {
    vi.mocked(getServerUser).mockRejectedValue(new Error('db unavailable'))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null })
  })
})
