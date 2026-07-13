import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { GET, PUT } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/locale-config', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/locale-config', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('returns defaults when no config is stored yet', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)

    const res = await GET()
    const body = await res.json()

    expect(body).toMatchObject({
      defaultLanguage: 'ru',
      dateFormat: 'DD.MM.YYYY',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })
  })
})

describe('PUT /api/admin/locale-config', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD' }))

    expect(res.status).toBe(403)
  })

  it('normalizes and persists a valid partial update', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD', priceFormat: 'symbol_after' }))
    const body = await res.json()

    expect(body).toMatchObject({
      dateFormat: 'YYYY-MM-DD',
      priceFormat: 'symbol_after',
      defaultLanguage: 'ru',
    })
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'locale-config' } })
    )
  })

  it('falls back to the default for an invalid enum value instead of persisting garbage', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'not-a-format' }))
    const body = await res.json()

    expect(body.dateFormat).toBe('DD.MM.YYYY')
  })
})
