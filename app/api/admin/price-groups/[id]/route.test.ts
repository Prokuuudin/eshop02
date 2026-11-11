import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/price-groups-server-store', () => ({
  updatePriceGroup: vi.fn(),
  deletePriceGroup: vi.fn(),
  setOverride: vi.fn(),
  removeOverride: vi.fn(),
}))

import { requireAdmin } from '@/lib/server-auth'
import {
  deletePriceGroup,
  removeOverride,
  setOverride,
  updatePriceGroup,
} from '@/lib/price-groups-server-store'
import { DELETE, PUT } from './route'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const context = { params: Promise.resolve({ id: 'g1' }) }
const validGroup = { name: 'VIP', description: '', multiplier: 0.9, color: '#112233' }

function put(body: unknown): { request: NextRequest; response: Promise<Response> } {
  const request = new NextRequest('https://shop.test/api/admin/price-groups/g1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return { request, response: PUT(request, context) }
}

function del(): { request: NextRequest; response: Promise<Response> } {
  const request = new NextRequest('https://shop.test/api/admin/price-groups/g1', { method: 'DELETE' })
  return { request, response: DELETE(request, context) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(actor as never)
  vi.mocked(updatePriceGroup).mockResolvedValue({ success: true })
  vi.mocked(deletePriceGroup).mockResolvedValue({ success: true })
  vi.mocked(setOverride).mockResolvedValue({ success: true })
  vi.mocked(removeOverride).mockResolvedValue({ success: true })
})

describe('/api/admin/price-groups/[id]', () => {
  it('passes actor/request when updating a group', async () => {
    const call = put(validGroup)
    expect((await call.response).status).toBe(200)
    expect(updatePriceGroup).toHaveBeenCalledWith('g1', validGroup, { actor, request: call.request })
  })

  it('passes actor/request when setting an individual price', async () => {
    const call = put({ action: 'set_override', productId: 'p1', price: 12 })
    expect((await call.response).status).toBe(200)
    expect(setOverride).toHaveBeenCalledWith('g1', 'p1', 12, { actor, request: call.request })
  })

  it('passes actor/request when removing an individual price', async () => {
    const call = put({ action: 'remove_override', productId: 'p1' })
    expect((await call.response).status).toBe(200)
    expect(removeOverride).toHaveBeenCalledWith('g1', 'p1', { actor, request: call.request })
  })

  it('passes actor/request when deleting a group', async () => {
    const call = del()
    expect((await call.response).status).toBe(200)
    expect(deletePriceGroup).toHaveBeenCalledWith('g1', { actor, request: call.request })
  })

  it.each(['PUT', 'DELETE'] as const)('denies %s without invoking a mutation', async (method) => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never)
    const response = method === 'PUT' ? put(validGroup).response : del().response

    expect((await response).status).toBe(403)
    expect(updatePriceGroup).not.toHaveBeenCalled()
    expect(deletePriceGroup).not.toHaveBeenCalled()
    expect(setOverride).not.toHaveBeenCalled()
    expect(removeOverride).not.toHaveBeenCalled()
  })
})
