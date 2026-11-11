import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string; slug: string }
const state = vi.hoisted(() => ({
  rows: new Map<string, Row>(), audits: [] as Array<Record<string, unknown>>,
  queue: Promise.resolve() as Promise<unknown>, failAudit: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const client = {
    blogPost: {
      findMany: vi.fn(async () => [...state.rows.values()].map((row) => structuredClone(row))),
      findFirst: vi.fn(async ({ where }: { where: { slug: string } }) =>
        structuredClone([...state.rows.values()].find((row) => row.slug === where.slug) ?? null)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(state.rows.get(where.id) ?? null)),
      upsert: vi.fn(async ({ where, create, update }: { where: { id: string }; create: Row; update: Record<string, unknown> }) => {
        const row = state.rows.has(where.id) ? { ...state.rows.get(where.id)!, ...update } : create
        state.rows.set(where.id, row)
        return structuredClone(row)
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = state.rows.get(where.id)!
        state.rows.delete(where.id)
        return row
      }),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn((run: (tx: unknown) => unknown) => {
      const queued = state.queue.then(async () => {
        const rows = structuredClone(state.rows)
        const audits = structuredClone(state.audits)
        try { return await run(client) } catch (error) {
          state.rows = rows; state.audits = audits; throw error
        }
      })
      state.queue = queued.then(() => undefined, () => undefined)
      return queued
    }),
  }
  return { prisma: client }
})
vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: vi.fn(async (_tx: unknown, _request: unknown, _actor: unknown, input: Record<string, unknown>) => {
    if (state.failAudit) throw new Error('audit failed')
    state.audits.push(input)
  }),
}))

import { prisma } from '@/lib/prisma'
import { createBlogPost, deleteBlogPostById } from '@/lib/blog-store'
import type { BlogPost } from '@/data/blog'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('https://shop.test/api/admin/blog', { method: 'POST' })
const audit = { actor, request } as never
const post: BlogPost = {
  id: 'post-1', slug: 'secret-post', title: 'Secret title', excerpt: 'Secret excerpt',
  content: 'Secret article body', contentBlocks: [{ type: 'paragraph', text: 'Hidden block' }],
  author: 'Admin', image: '/media/secret.jpg', category: 'care', readTime: 4,
  createdAt: new Date('2026-11-09T10:00:00.000Z'), featured: false, status: 'published',
  publishedAt: new Date('2026-11-09T10:00:00.000Z'), relatedProductIds: ['p1'],
  translations: { en: { title: 'Hidden translation' } },
}

beforeEach(() => {
  state.rows = new Map(); state.audits = []; state.queue = Promise.resolve(); state.failAudit = false
  vi.clearAllMocks()
})

describe('audited blog persistence', () => {
  it('creates a post and stores fingerprints instead of article or media content', async () => {
    const result = await createBlogPost(post, audit)
    expect(result).toMatchObject({ changed: true, created: true, post: { id: 'post-1' } })
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({
      action: 'blog.created', entityId: 'post-1', entityTitle: 'secret-post',
      after: {
        title: { bytes: Buffer.byteLength(post.title), sha256: createHash('sha256').update(post.title).digest('hex') },
        content: { bytes: Buffer.byteLength(post.content), sha256: createHash('sha256').update(post.content).digest('hex') },
        image: { bytes: Buffer.byteLength(post.image), sha256: createHash('sha256').update(post.image).digest('hex') },
      },
    })
    const auditJson = JSON.stringify(state.audits)
    expect(auditJson).not.toContain('Secret title')
    expect(auditJson).not.toContain('Secret article body')
    expect(auditJson).not.toContain('/media/secret.jpg')
  })

  it('serializes an identical retry and creates no duplicate event', async () => {
    const [first, second] = await Promise.all([createBlogPost(post, audit), createBlogPost(post, audit)])
    expect([first.changed, second.changed]).toEqual([true, false])
    expect(prisma.blogPost.upsert).toHaveBeenCalledOnce()
    expect(state.audits).toHaveLength(1)
  })

  it('audits only changed fields on update', async () => {
    await createBlogPost(post, audit)
    state.audits = []
    await createBlogPost({ ...post, readTime: 5, content: 'New secret body', updatedAt: new Date() }, audit)
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({
      action: 'blog.updated', before: { readTime: 4, content: expect.any(Object) },
      after: { readTime: 5, content: expect.any(Object) },
    })
  })

  it('rolls create and delete back when audit append fails', async () => {
    state.failAudit = true
    await expect(createBlogPost(post, audit)).rejects.toThrow('audit failed')
    expect(state.rows.size).toBe(0)
    state.failAudit = false
    await createBlogPost(post, audit)
    state.failAudit = true
    await expect(deleteBlogPostById(post.id, audit)).rejects.toThrow('audit failed')
    expect(state.rows.has(post.id)).toBe(true)
  })

  it('treats repeated deletion as a no-op without another event', async () => {
    await createBlogPost(post, audit)
    state.audits = []
    await expect(deleteBlogPostById(post.id, audit)).resolves.toMatchObject({ id: post.id })
    await expect(deleteBlogPostById(post.id, audit)).resolves.toBeNull()
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ action: 'blog.deleted', entityId: post.id })
  })
})
