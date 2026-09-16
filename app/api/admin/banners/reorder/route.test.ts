import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), transaction: vi.fn(), update: vi.fn(), tag: vi.fn(), path: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/storefront-cache', () => ({ STOREFRONT_CACHE_TAGS: { banners: 'storefront-banners' } }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))

import { POST } from './route'

let stored: { id: string; order: number }[]
function request(id: string, direction: string) {
  return new NextRequest('http://localhost/api/admin/banners/reorder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, direction }),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ id: 'admin' })
  stored = [{ id: 'a', order: 0 }, { id: 'b', order: 0 }, { id: 'c', order: 0 }]
  mocks.update.mockReset()
  mocks.transaction.mockImplementation(async (run) => {
    const draft = stored.map((row) => ({ ...row }))
    const result = await run({ banner: {
      findMany: async () => [...draft].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(({ id }) => ({ id })),
      update: async (args: { where: { id: string }; data: { order: number } }) => {
        await mocks.update(args)
        draft.find((row) => row.id === args.where.id)!.order = args.data.order
      },
    } })
    stored = draft
    return result
  })
})
function savedOrder() {
  return [...stored].sort((a, b) => a.order - b.order).map((row) => row.id)
}
describe('moving banners', () => {
  it('moves up and down and persists distinct positions even when legacy positions match', async () => {
    expect((await POST(request('b', 'up'))).status).toBe(200)
    expect(savedOrder()).toEqual(['b', 'a', 'c'])
    expect(stored.map((row) => row.order).sort()).toEqual([1, 2, 3])
    expect((await POST(request('b', 'down'))).status).toBe(200)
    expect(savedOrder()).toEqual(['a', 'b', 'c'])
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
  it('does not move past the first or last position', async () => {
    expect(await (await POST(request('a', 'up'))).json()).toEqual({ ok: true, moved: false })
    expect(await (await POST(request('c', 'down'))).json()).toEqual({ ok: true, moved: false })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not publish a partially saved order if a write fails', async () => {
    mocks.update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write failed'))
    expect((await POST(request('b', 'up'))).status).toBe(500)
    expect(stored).toEqual([{ id: 'a', order: 0 }, { id: 'b', order: 0 }, { id: 'c', order: 0 }])
    expect(mocks.tag).not.toHaveBeenCalled()
  })
  it('rejects unknown banners and invalid directions', async () => {
    expect((await POST(request('missing', 'up'))).status).toBe(404)
    expect((await POST(request('a', 'sideways'))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('requires admin access', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request('b', 'up'))).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
