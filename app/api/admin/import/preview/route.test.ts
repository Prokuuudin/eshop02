import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({ getMergedProducts: vi.fn() }))
import { requireAdminPermission } from '@/lib/server-auth'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/admin/import/preview', { method: 'POST', body: JSON.stringify(body) }))
const valid = (id: string) => ({ id, title: 'Title', brand: 'Brand', price: '10.50', stock: '3', category: 'hair' })

describe('POST /api/admin/import/preview', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin' } as never); vi.mocked(getMergedProducts).mockResolvedValue([]) })
  it('requires catalog.update permission', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never)
    expect((await post({ rows: [valid('p1')] })).status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('catalog.update')
  })
  it('rejects an empty import without loading the catalog', async () => {
    expect((await post({ rows: [] })).status).toBe(400)
    expect(getMergedProducts).not.toHaveBeenCalled()
  })
  it('marks malformed monetary and category data as errors', async () => {
    const response = await post({ rows: [{ ...valid('p1'), price: '-1' }, { ...valid('p2'), category: 'forged' }] })
    const json = await response.json()
    expect(json.summary).toEqual({ create: 0, update: 0, skip: 0, error: 2 })
  })
  it('distinguishes create, update and duplicate rows', async () => {
    vi.mocked(getMergedProducts).mockResolvedValue([{ id: 'existing' }] as never)
    const response = await post({ mode: 'upsert', rows: [valid('new'), valid('existing'), valid('new')] })
    const json = await response.json()
    expect(json.rows.map((row: { action: string }) => row.action)).toEqual(['create', 'update', 'error'])
    expect(json.summary).toEqual({ create: 1, update: 1, skip: 0, error: 1 })
  })
})
