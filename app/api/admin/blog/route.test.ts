import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), getAll: vi.fn(), save: vi.fn(), remove: vi.fn(), path: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/blog-store', () => ({
  getAllBlogPosts: mocks.getAll, createBlogPost: mocks.save, deleteBlogPostById: mocks.remove,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.path }))

import { POST } from './route'
import { DELETE } from './[id]/route'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const payload = {
  id: 'post-1', slug: 'new-post', title: 'Title', excerpt: 'Excerpt', content: 'Body',
  author: 'Admin', image: '/media/post.jpg', category: 'care', readTime: 3, status: 'published',
}
function request(body: unknown): NextRequest {
  return new NextRequest('https://shop.test/api/admin/blog', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue(actor)
  mocks.getAll.mockResolvedValue([])
  mocks.save.mockImplementation(async (post) => ({ post, changed: true, created: true }))
  mocks.remove.mockResolvedValue({ id: 'post-1', slug: 'new-post' })
})

describe('blog admin routes', () => {
  it('rejects requests without admin access before storage', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request(payload))).status).toBe(403)
    expect((await DELETE(new NextRequest('https://shop.test/api/admin/blog/post-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'post-1' }) })).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('rejects invalid slug and content blocks without writing', async () => {
    expect((await POST(request({ ...payload, slug: '***' }))).status).toBe(422)
    expect((await POST(request({ ...payload, contentBlocks: [{ type: 'image', src: '' }] }))).status).toBe(422)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('passes the normalized post, actor and request to transactional storage', async () => {
    const req = request(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1', slug: 'new-post', title: 'Title' }),
      { actor, request: req },
    )
    expect(mocks.path).toHaveBeenCalledWith('/blog/new-post')
  })

  it('deletes through audited storage and keeps the response contract', async () => {
    const req = new NextRequest('https://shop.test/api/admin/blog/post-1', { method: 'DELETE' })
    const response = await DELETE(req, { params: Promise.resolve({ id: 'post-1' }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.remove).toHaveBeenCalledWith('post-1', { actor, request: req })
    expect(mocks.path).toHaveBeenCalledWith('/blog/new-post')
  })
})
