import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/user-erasure', () => ({ exportUserData: vi.fn() }))
vi.mock('@/lib/user-export-pdf', () => ({ createUserExportPdf: vi.fn(() => new Uint8Array([1, 2, 3])) }))

import { getServerUser } from '@/lib/server-auth'
import { exportUserData } from '@/lib/user-erasure'
import { GET } from './route'

describe('GET /api/user/export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires authentication', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect(exportUserData).not.toHaveBeenCalled()
  })

  it('ignores client identity and exports only the session user', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', email: 'a@example.com' } as never)
    vi.mocked(exportUserData).mockResolvedValue({ exportedAt: '2026-08-15T00:00:00.000Z' } as never)
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(exportUserData).toHaveBeenCalledWith({ id: 'user-a', email: 'a@example.com' })
  })
})
