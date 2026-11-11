import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import type { BlogPost as PrismaBlogPost } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { type BlogPost, type BlogContentBlock } from '@/data/blog'
import type { Language } from '@/data/translations'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

type BlogTranslations = Partial<Record<Language, Partial<Pick<BlogPost, 'title' | 'excerpt' | 'content' | 'contentBlocks' | 'author' | 'category'>>>>
type AuditContext = { actor: ServerUser; request: NextRequest }
const BLOG_LOCK_KEY = 'blog-posts'
const BLOG_FIELDS = [
  'slug', 'title', 'excerpt', 'content', 'contentBlocks', 'author', 'image', 'category',
  'readTime', 'createdAt', 'featured', 'status', 'publishedAt', 'authorRole', 'authorBio',
  'relatedProductIds', 'translations',
] as const satisfies ReadonlyArray<keyof BlogPost>
const HASHED_FIELDS = new Set<keyof BlogPost>([
  'title', 'excerpt', 'content', 'contentBlocks', 'image', 'authorBio', 'translations',
])

function mapDbToBlogPost(row: PrismaBlogPost): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    contentBlocks: row.contentBlocks ? (row.contentBlocks as BlogContentBlock[]) : undefined,
    author: row.author,
    image: row.image,
    category: row.category,
    readTime: row.readTime,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt ? (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)) : undefined,
    featured: row.featured,
    status: row.status === 'draft' ? 'draft' : 'published',
    publishedAt: row.publishedAt ?? undefined,
    authorRole: row.authorRole ?? undefined,
    authorBio: row.authorBio ?? undefined,
    relatedProductIds: row.relatedProductIds ?? undefined,
    translations: row.translations ? (row.translations as BlogTranslations) : undefined,
  }
}

function mapBlogPostToDb(post: BlogPost) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    contentBlocks: post.contentBlocks ?? Prisma.DbNull,
    author: post.author,
    image: post.image,
    category: post.category,
    readTime: post.readTime,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt ?? null,
    featured: post.featured ?? false,
    status: post.status ?? 'published',
    publishedAt: post.publishedAt ?? (post.status === 'draft' ? null : post.createdAt),
    authorRole: post.authorRole ?? null,
    authorBio: post.authorBio ?? null,
    relatedProductIds: post.relatedProductIds ?? [],
    translations: post.translations ?? Prisma.DbNull,
  }
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({
    where: {
      status: 'published',
      OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapDbToBlogPost)
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(mapDbToBlogPost)
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const row = await prisma.blogPost.findFirst({
    where: {
      slug,
      status: 'published',
      OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
    },
  })
  return row ? mapDbToBlogPost(row) : null
}

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value ?? null)
}

function auditValue(field: keyof BlogPost, value: unknown): unknown {
  if (!HASHED_FIELDS.has(field)) return value instanceof Date ? value.toISOString() : value ?? null
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') }
}

function blogChanges(before: BlogPost | null, after: BlogPost | null) {
  const fields = BLOG_FIELDS.filter((field) => comparable(before?.[field]) !== comparable(after?.[field]))
  return {
    fields,
    before: Object.fromEntries(fields.map((field) => [field, auditValue(field, before?.[field])])),
    after: Object.fromEntries(fields.map((field) => [field, auditValue(field, after?.[field])])),
  }
}

export async function createBlogPost(
  post: BlogPost,
  audit: AuditContext,
): Promise<{ post: BlogPost; changed: boolean; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BLOG_LOCK_KEY}))`
    const row = await tx.blogPost.findUnique({ where: { id: post.id } })
    const before = row ? mapDbToBlogPost(row) : null
    const changes = blogChanges(before, post)
    if (before && changes.fields.length === 0) return { post: before, changed: false, created: false }
    const savedRow = await tx.blogPost.upsert({
      where: { id: post.id },
      create: { id: post.id, ...mapBlogPostToDb(post) },
      update: mapBlogPostToDb({ ...post, updatedAt: post.updatedAt ?? new Date() }),
    })
    const saved = mapDbToBlogPost(savedRow)
    const savedChanges = blogChanges(before, saved)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: before ? 'blog.updated' : 'blog.created', entityType: 'blog_post',
      entityId: saved.id, entityTitle: saved.slug,
      before: before ? savedChanges.before : undefined, after: savedChanges.after,
    })
    return { post: saved, changed: true, created: !before }
  })
}

export async function deleteBlogPostById(id: string, audit: AuditContext): Promise<BlogPost | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BLOG_LOCK_KEY}))`
    const row = await tx.blogPost.findUnique({ where: { id } })
    if (!row) return null
    const existing = mapDbToBlogPost(row)
    await tx.blogPost.delete({ where: { id } })
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'blog.deleted', entityType: 'blog_post', entityId: id,
      entityTitle: existing.slug, before: blogChanges(existing, null).before,
    })
    return existing
  })
}
