import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { BlogPost as PrismaBlogPost } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { type BlogPost, type BlogContentBlock } from '@/data/blog'
import type { Language } from '@/data/translations'

type BlogTranslations = Partial<Record<Language, Partial<Pick<BlogPost, 'title' | 'excerpt' | 'content' | 'contentBlocks' | 'author' | 'category'>>>>

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

export async function createBlogPost(post: BlogPost): Promise<void> {
  await prisma.blogPost.upsert({
    where: { id: post.id },
    create: { id: post.id, ...mapBlogPostToDb(post) },
    update: mapBlogPostToDb(post),
  })
}

export async function deleteBlogPostById(id: string): Promise<void> {
  const existing = await prisma.blogPost.findUnique({ where: { id } })
  if (!existing) return
  await prisma.blogPost.delete({ where: { id } })
}
