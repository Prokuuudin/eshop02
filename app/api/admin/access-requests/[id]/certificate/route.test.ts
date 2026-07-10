import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

const makeRequest = () =>
  new NextRequest('http://localhost/api/admin/access-requests/req1/certificate')
const params = { params: Promise.resolve({ id: 'req1' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/access-requests/[id]/certificate', () => {
  it('не-админ → 403', async () => {
    vi.mocked(getServerUser as any).mockResolvedValue({ platformRole: 'customer' })
    const res = await GET(makeRequest(), params)
    expect(res.status).toBe(403)
  })

  it('сертификата нет → 404', async () => {
    vi.mocked(getServerUser as any).mockResolvedValue({ platformRole: 'admin' })
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)
    const res = await GET(makeRequest(), params)
    expect(res.status).toBe(404)
  })

  it('отдаёт файл с правильным content-type inline', async () => {
    vi.mocked(getServerUser as any).mockResolvedValue({ platformRole: 'admin' })
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('jpeg-bytes').toString('base64')
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue({
      key: 'access-request-cert-req1',
      value: { data: dataUrl, name: 'diploms.jpg' },
    })

    const res = await GET(makeRequest(), params)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('jpeg-bytes')
  })
})
