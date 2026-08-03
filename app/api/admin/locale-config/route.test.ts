import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const {
  settingFindUniqueMock,
  settingUpsertMock,
  requireAdminMock,
  transactionMock,
} = vi.hoisted(() => ({
  settingFindUniqueMock: vi.fn(),
  settingUpsertMock: vi.fn(),
  requireAdminMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      findUnique: settingFindUniqueMock,
      upsert: settingUpsertMock,
    },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: requireAdminMock,
}))

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
  transactionMock.mockImplementation((callback) => callback({
    keyValueSetting: { findUnique: settingFindUniqueMock, upsert: settingUpsertMock },
  }))
})

describe('GET /api/admin/locale-config', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('returns defaults when no config is stored yet', async () => {
    requireAdminMock.mockResolvedValue(ADMIN_USER)
    settingFindUniqueMock.mockResolvedValue(null)

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
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD' }))

    expect(res.status).toBe(403)
  })

  it('normalizes and persists a valid partial update', async () => {
    requireAdminMock.mockResolvedValue(ADMIN_USER)
    settingFindUniqueMock.mockResolvedValue(null)
    settingUpsertMock.mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD', priceFormat: 'symbol_after' }))
    const body = await res.json()

    expect(body).toMatchObject({
      dateFormat: 'YYYY-MM-DD',
      priceFormat: 'symbol_after',
      defaultLanguage: 'ru',
    })
    expect(settingUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'locale-config' } })
    )
  })

  it('falls back to the default for an invalid enum value instead of persisting garbage', async () => {
    requireAdminMock.mockResolvedValue(ADMIN_USER)
    settingFindUniqueMock.mockResolvedValue(null)
    settingUpsertMock.mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'not-a-format' }))
    const body = await res.json()

    expect(body.dateFormat).toBe('DD.MM.YYYY')
  })
})
