import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createBlogPost, getBlogPosts } from '@/lib/blog-store'
import type { BlogContentBlock, BlogPost } from '@/data/blog'

export const runtime = 'nodejs'

type CreateBlogPostPayload = {
  id?: string
  slug: string
  title: string
  excerpt: string
  content?: string
  contentBlocks?: BlogContentBlock[]
  author: string
  image: string
  category: string
  readTime: number
  createdAt?: string
  featured?: boolean
}

type ValidationResult = {
  ok: boolean
  error?: string
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateContentBlocks(blocks: unknown): ValidationResult {
  if (blocks === undefined) {
    return { ok: true }
  }

  if (!Array.isArray(blocks)) {
    return { ok: false, error: 'contentBlocks must be an array' }
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const rawBlock = blocks[i]
    if (!rawBlock || typeof rawBlock !== 'object') {
      return { ok: false, error: `Block #${i + 1}: must be an object` }
    }

    const block = rawBlock as Record<string, unknown>
    const type = block.type
    if (!isNonEmptyString(type)) {
      return { ok: false, error: `Block #${i + 1}: missing or invalid type` }
    }

    if (type === 'heading') {
      const level = block.level
      if (![1, 2, 3].includes(Number(level)) || !isNonEmptyString(block.text)) {
        return { ok: false, error: `Block #${i + 1} (heading): requires level 1-3 and text` }
      }
      continue
    }

    if (type === 'paragraph') {
      if (!isNonEmptyString(block.text)) {
        return { ok: false, error: `Block #${i + 1} (paragraph): requires text` }
      }
      continue
    }

    if (type === 'list') {
      if (!Array.isArray(block.items) || block.items.length === 0 || !block.items.every(isNonEmptyString)) {
        return { ok: false, error: `Block #${i + 1} (list): requires non-empty string items[]` }
      }
      continue
    }

    if (type === 'quote') {
      if (!isNonEmptyString(block.text)) {
        return { ok: false, error: `Block #${i + 1} (quote): requires text` }
      }
      continue
    }

    if (type === 'image') {
      if (!isNonEmptyString(block.src) || !isNonEmptyString(block.alt)) {
        return { ok: false, error: `Block #${i + 1} (image): requires src and alt` }
      }
      continue
    }

    if (type === 'gallery') {
      const images = block.images
      if (!Array.isArray(images) || images.length === 0) {
        return { ok: false, error: `Block #${i + 1} (gallery): requires non-empty images[]` }
      }

      for (let imgIndex = 0; imgIndex < images.length; imgIndex += 1) {
        const image = images[imgIndex]
        if (!image || typeof image !== 'object') {
          return { ok: false, error: `Block #${i + 1} (gallery): image #${imgIndex + 1} must be an object` }
        }

        const imageRecord = image as Record<string, unknown>
        if (!isNonEmptyString(imageRecord.src) || !isNonEmptyString(imageRecord.alt)) {
          return { ok: false, error: `Block #${i + 1} (gallery): image #${imgIndex + 1} requires src and alt` }
        }
      }

      continue
    }

    return { ok: false, error: `Block #${i + 1}: unsupported type \"${type}\"` }
  }

  return { ok: true }
}

export async function GET(): Promise<NextResponse> {
  const posts = await getBlogPosts()
  return NextResponse.json({ posts })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: CreateBlogPostPayload
  try {
    payload = (await request.json()) as CreateBlogPostPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const slug = normalizeSlug(payload.slug ?? '')
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'invalid_slug' }, { status: 422 })
  }

  if (!payload.title?.trim()) {
    return NextResponse.json({ ok: false, error: 'invalid_title' }, { status: 422 })
  }

  const blocksValidation = validateContentBlocks(payload.contentBlocks)
  if (!blocksValidation.ok) {
    return NextResponse.json({ ok: false, error: blocksValidation.error ?? 'invalid_content_blocks' }, { status: 422 })
  }

  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date()
  const safeReadTime = Number.isFinite(payload.readTime) && payload.readTime > 0 ? payload.readTime : 3
  const existingPosts = await getBlogPosts()
  const existingPost = existingPosts.find((item) => item.id === payload.id)

  const post: BlogPost = {
    id: payload.id?.trim() || `post-${Date.now()}`,
    slug,
    title: payload.title.trim(),
    excerpt: payload.excerpt?.trim() || '',
    content: payload.content ?? '',
    contentBlocks: Array.isArray(payload.contentBlocks) ? payload.contentBlocks : undefined,
    author: payload.author?.trim() || 'Admin',
    image: payload.image?.trim() || '/blog/skincare-guide.jpg',
    category: payload.category?.trim() || 'face care',
    readTime: safeReadTime,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    updatedAt: existingPost ? new Date() : undefined,
    featured: Boolean(payload.featured)
  }

  await createBlogPost(post)

  revalidatePath('/blog')
  revalidatePath(`/blog/${post.slug}`)
  if (existingPost && existingPost.slug !== post.slug) {
    revalidatePath(`/blog/${existingPost.slug}`)
  }

  return NextResponse.json({ ok: true, post })
}
