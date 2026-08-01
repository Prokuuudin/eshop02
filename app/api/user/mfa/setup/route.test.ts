import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  generateTotpSecret: vi.fn(() => 'RAWSECRET'),
  buildOtpauthUri: vi.fn(() => 'otpauth://totp/test'),
  encryptSecret: vi.fn(() => 'ENCRYPTED'),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,xxx') } }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

function makeRequest() {
  return new NextRequest('http://localhost/api/user/mfa/setup', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie: 'eshop_session=tok' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/user/mfa/setup', () => {
  it('rejects unauthenticated callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('rejects non-admin callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', platformRole: 'customer' } as never)
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  it('generates and stores an encrypted pending secret for an admin', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', email: 'admin@test.com', platformRole: 'admin' } as never)
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.secret).toBe('RAWSECRET')
    expect(json.qrCodeDataUrl).toBe('data:image/png;base64,xxx')
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaSecret: 'ENCRYPTED' },
    })
  })

  it('rejects a cross-site Origin', async () => {
    const req = new NextRequest('http://localhost/api/user/mfa/setup', {
      method: 'POST',
      headers: { origin: 'https://evil.test', cookie: 'eshop_session=tok' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(getServerUser).not.toHaveBeenCalled()
  })
})
