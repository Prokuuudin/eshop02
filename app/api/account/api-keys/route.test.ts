import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn(), verifyPassword: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/company-api-keys', () => ({
  generateCompanyApiKey: vi.fn(),
  getCompanyApiKeyMeta: vi.fn(),
  revokeCompanyApiKey: vi.fn(),
}))
vi.mock('@/lib/api-guard', () => ({ guardOrigin: vi.fn().mockReturnValue(null) }))

import { getServerUser } from '@/lib/server-auth'
import { verifyPassword } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { generateCompanyApiKey, getCompanyApiKeyMeta, revokeCompanyApiKey } from '@/lib/company-api-keys'
import { GET, POST, DELETE } from './route'

const req = (method: string, body?: unknown) => new NextRequest('https://shop.test/api/account/api-keys', {
  method, ...(body ? { body: JSON.stringify(body) } : {}),
})

describe('/api/account/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'hash' } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)
  })

  it('GET 401s when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('GET 400s when the user has no company', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: undefined } as never)
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it("GET returns the caller's own company key metadata, never a plaintext key", async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'company-a', teamRole: 'admin' } as never)
    vi.mocked(getCompanyApiKeyMeta).mockResolvedValue({ id: 'k1', keyPrefix: 'b2b_live_abc', createdAt: 'x', lastUsedAt: null })
    const res = await GET()
    const body = await res.json()
    expect(getCompanyApiKeyMeta).toHaveBeenCalledWith('company-a')
    expect(body.key.keyPrefix).toBe('b2b_live_abc')
    expect(body).not.toHaveProperty('plaintext')
  })

  it('POST generates a key scoped to the session company and returns the plaintext once', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'company-a', teamRole: 'admin' } as never)
    vi.mocked(generateCompanyApiKey).mockResolvedValue({
      plaintext: 'b2b_live_secret', meta: { id: 'k1', keyPrefix: 'b2b_live_sec', createdAt: 'x', lastUsedAt: null },
    })
    const res = await POST(req('POST', { currentPassword: 'correct-password' }))
    const body = await res.json()
    expect(generateCompanyApiKey).toHaveBeenCalledWith('company-a')
    expect(body.plaintext).toBe('b2b_live_secret')
  })

  it('DELETE revokes the key for the session company', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'company-a', teamRole: 'admin' } as never)
    vi.mocked(revokeCompanyApiKey).mockResolvedValue(true)
    const res = await DELETE(req('DELETE', { currentPassword: 'correct-password' }))
    const body = await res.json()
    expect(revokeCompanyApiKey).toHaveBeenCalledWith('company-a')
    expect(body.revoked).toBe(true)
  })

  it('does not let a viewer inspect or rotate the company API key', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'viewer', companyId: 'company-a', teamRole: 'viewer' } as never)
    expect((await GET()).status).toBe(403)
    expect((await POST(req('POST', { currentPassword: 'password' }))).status).toBe(403)
    expect(getCompanyApiKeyMeta).not.toHaveBeenCalled()
    expect(generateCompanyApiKey).not.toHaveBeenCalled()
  })

  it('requires the current password before rotating a key', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'company-a', teamRole: 'admin' } as never)
    vi.mocked(verifyPassword).mockResolvedValue(false)
    const res = await POST(req('POST', { currentPassword: 'wrong-password' }))
    expect(res.status).toBe(401)
    expect(generateCompanyApiKey).not.toHaveBeenCalled()
  })
})
