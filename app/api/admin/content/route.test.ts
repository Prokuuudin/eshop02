import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  save: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/site-content-server-store', () => ({ saveSiteContentOverridesToStore: mocks.save }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { PUT } from './route'

const actor = { id: 'admin-1', email: 'admin@hairshop.test', platformRole: 'admin' }
const payload = { text: { ru: { 'home.hero.title': 'Новый заголовок' }, en: {}, lv: {} }, images: {} }

function request(): NextRequest {
  return new NextRequest('https://shop.test/api/admin/content', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue(actor)
  mocks.save.mockResolvedValue(payload)
})

describe('PUT /api/admin/content', () => {
  it('passes the authenticated server actor and revalidates only after a successful save', async () => {
    const req = request()
    const response = await PUT(req)

    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(payload, actor, req)
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3)
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidatePath.mock.invocationCallOrder[0])
  })

  it('does not mutate or revalidate without admin permission', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const response = await PUT(request())

    expect(response.status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not revalidate cache when the transactional save fails', async () => {
    mocks.save.mockRejectedValueOnce(new Error('audit unavailable'))

    const response = await PUT(request())

    expect(response.status).toBe(400)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
