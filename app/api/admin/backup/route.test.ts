import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { readFileMock, requireAdminMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('fs', () => ({ promises: { readFile: readFileMock } }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))

import { GET, POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
  readFileMock.mockImplementation(async (filePath: string) => {
    const filename = filePath.replaceAll('\\', '/').split('/').at(-1)
    return JSON.stringify({ source: filename })
  })
})

describe('GET /api/admin/backup', () => {
  it('rejects non-admins without reading files', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const response = await GET()

    expect(response.status).toBe(403)
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('exports only the supported file-backed configuration', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.kind).toBe('configuration-export')
    expect(Object.keys(body.files)).toEqual([
      'blog-posts.json',
      'site-content.json',
      'custom-products.json',
      'product-overrides.json',
      'banners.json',
      'promo-codes.json',
      'shipping-settings.json',
    ])
    expect(body.files).not.toHaveProperty('orders.json')
    expect(body.files).not.toHaveProperty('reviews.json')
  })
})

describe('POST /api/admin/backup', () => {
  it('keeps automatic restoration disabled', async () => {
    const request = new NextRequest('http://localhost/api/admin/backup', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
    expect(await response.json()).toEqual({
      error: 'configuration_restore_disabled_use_controlled_maintenance',
    })
  })
})
