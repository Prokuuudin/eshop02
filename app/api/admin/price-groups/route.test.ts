import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/price-groups-server-store', () => ({
  createPriceGroup: vi.fn(),
  readPriceGroupsData: vi.fn(),
}))

import { requireAdmin } from '@/lib/server-auth'
import { createPriceGroup } from '@/lib/price-groups-server-store'
import { POST } from './route'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const validGroup = { name: 'VIP', description: '', multiplier: 0.9, color: '#112233' }

function post(body: unknown): { request: NextRequest; response: Promise<Response> } {
  const request = new NextRequest('https://shop.test/api/admin/price-groups', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { request, response: POST(request) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(actor as never)
})

describe('POST /api/admin/price-groups', () => {
  it('passes the authenticated actor and request to the transactional store', async () => {
    vi.mocked(createPriceGroup).mockResolvedValue({
      success: true,
      group: { ...validGroup, id: 'g1', createdAt: '2026-11-09T10:00:00.000Z' },
    })
    const call = post(validGroup)

    expect((await call.response).status).toBe(201)
    expect(createPriceGroup).toHaveBeenCalledWith(validGroup, { actor, request: call.request })
  })

  it('stops before validation and mutation when admin access is denied', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never)

    expect((await post(validGroup).response).status).toBe(403)
    expect(createPriceGroup).not.toHaveBeenCalled()
  })

  it('does not call the store for an invalid group', async () => {
    expect((await post({ ...validGroup, name: '' }).response).status).toBe(400)
    expect(createPriceGroup).not.toHaveBeenCalled()
  })
})
