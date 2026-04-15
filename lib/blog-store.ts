import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { BLOG_POSTS, type BlogPost } from '@/data/blog'

type StoredBlogPost = Omit<BlogPost, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt?: string
}

const BLOG_STORE_FILE = path.join(process.cwd(), 'data', 'blog-posts.json')

function toStoredPost(post: BlogPost): StoredBlogPost {
  return {
    ...post,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt ? post.updatedAt.toISOString() : undefined
  }
}

function fromStoredPost(post: StoredBlogPost): BlogPost {
  return {
    ...post,
    createdAt: new Date(post.createdAt),
    updatedAt: post.updatedAt ? new Date(post.updatedAt) : undefined
  }
}

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(BLOG_STORE_FILE)
  } catch {
    const initialPosts = BLOG_POSTS.map(toStoredPost)
    await fs.writeFile(BLOG_STORE_FILE, JSON.stringify(initialPosts, null, 2), 'utf-8')
  }
}

async function readStoredPosts(): Promise<StoredBlogPost[]> {
  await ensureStoreFile()
  const content = await fs.readFile(BLOG_STORE_FILE, 'utf-8')

  try {
    const parsed = JSON.parse(content) as StoredBlogPost[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

async function writeStoredPosts(posts: BlogPost[]): Promise<void> {
  const stored = posts.map(toStoredPost)
  await fs.writeFile(BLOG_STORE_FILE, JSON.stringify(stored, null, 2), 'utf-8')
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const stored = await readStoredPosts()
  const posts = stored.map(fromStoredPost)
  return posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const posts = await getBlogPosts()
  return posts.find((post) => post.slug === slug) ?? null
}

export async function createBlogPost(post: BlogPost): Promise<void> {
  const posts = await getBlogPosts()
  const nextPosts = [post, ...posts.filter((item) => item.id !== post.id)]
  await writeStoredPosts(nextPosts)
}

export async function deleteBlogPostById(id: string): Promise<void> {
  const posts = await getBlogPosts()
  const nextPosts = posts.filter((post) => post.id !== id)
  await writeStoredPosts(nextPosts)
}
