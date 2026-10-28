import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: vi.fn() } } }))
vi.mock('@/lib/sync/manual-stock-preview', () => ({ evaluateStockPreview: vi.fn() }))

import { requireAdminPermission } from '@/lib/server-auth'
import { evaluateStockPreview } from '@/lib/sync/manual-stock-preview'
import { POST } from './route'

const admin = { id: 'admin-1', email: 'admin@test' } as never
const allow = () => vi.mocked(requireAdminPermission).mockResolvedValue(admin)
const request = (name: string, content: string) => {
  const form = new FormData()
  form.append('file', new File([content], name, { type: 'text/xml' }))
  return new NextRequest('https://shop.test/api/admin/grins-import/stocks-preview', { method: 'POST', body: form })
}

describe('POST /api/admin/grins-import/stocks-preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the existing GrinS admin authorization before evaluation', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }))
    expect((await POST(request('export.xml', '<root/>'))).status).toBe(401)
    expect(evaluateStockPreview).not.toHaveBeenCalled()
  })

  it('requires both permissions used by the existing manual GrinS import', async () => {
    vi.mocked(requireAdminPermission).mockImplementation(async permission =>
      permission === 'prices.update' ? NextResponse.json({ error: 'forbidden' }, { status: 403 }) : admin)
    expect((await POST(request('export.xml', '<root/>'))).status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('catalog.update')
    expect(requireAdminPermission).toHaveBeenCalledWith('prices.update')
    expect(evaluateStockPreview).not.toHaveBeenCalled()
  })

  it('reuses upload validation and rejects DTD/entity input', async () => {
    allow()
    const response = await POST(request('export.xml', '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><root>&x;</root>'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'forbidden_xml_construct' })
    expect(evaluateStockPreview).not.toHaveBeenCalled()
  })

  it('returns an explicitly read-only, non-applicable response with all changes', async () => {
    allow()
    const changes = [{ externalId: 'G-1', localSku: 'L-1', currentStock: 2, incomingStock: 5, delta: 3, percentageChange: 150, largeDifference: true, zeroTransition: null }]
    vi.mocked(evaluateStockPreview).mockResolvedValue({
      hard: [], warnings: ['not confirmed'], summary: { rows: 1 }, changes,
      samples: { unlinked: [], softDeleted: [], duplicates: [], invalidValues: [], negativeValues: [] },
    } as never)
    const response = await POST(request('export.xml', '<root/>'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ mode: 'stocks-only-preview', readOnly: true, canApply: false, changes })
    expect(body.previewId).toBeUndefined()
    expect(body.apply).toBeUndefined()
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/u)
  })
})
