import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { settingFindUniqueMock, getServerUserMock } = vi.hoisted(() => ({
  settingFindUniqueMock: vi.fn(),
  getServerUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: settingFindUniqueMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
}))

import { GET } from './route'

const makeRequest = () =>
  new NextRequest('http://localhost/api/admin/access-requests/req1/certificate')
const params = { params: Promise.resolve({ id: 'req1' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/access-requests/[id]/certificate', () => {
  it('не-админ → 403', async () => {
    getServerUserMock.mockResolvedValue({ platformRole: 'customer' })
    const res = await GET(makeRequest(), params)
    expect(res.status).toBe(403)
  })

  it('сертификата нет → 404', async () => {
    getServerUserMock.mockResolvedValue({ platformRole: 'admin' })
    settingFindUniqueMock.mockResolvedValue(null)
    const res = await GET(makeRequest(), params)
    expect(res.status).toBe(404)
  })

  it('отдаёт файл с правильным content-type inline', async () => {
    getServerUserMock.mockResolvedValue({ platformRole: 'admin' })
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('jpeg-bytes').toString('base64')
    settingFindUniqueMock.mockResolvedValue({
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
