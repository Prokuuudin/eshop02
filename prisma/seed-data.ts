import { config } from 'dotenv'
config({ path: '.env.local' })

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DATA_DIR = path.join(process.cwd(), 'data')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonBlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  contentBlocks?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  author: string
  image: string
  category: string
  readTime: number
  createdAt: string
  updatedAt?: string
  featured?: boolean
  translations?: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function seedBlogPosts() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'blog-posts.json'), 'utf-8')
  const posts = JSON.parse(raw) as JsonBlogPost[]
  let count = 0
  for (const p of posts) {
    await prisma.blogPost.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        contentBlocks: p.contentBlocks,
        author: p.author,
        image: p.image,
        category: p.category,
        readTime: p.readTime ?? 0,
        createdAt: new Date(p.createdAt),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
        featured: p.featured ?? false,
        translations: p.translations,
      },
    })
    count++
  }
  console.log(`Seeded ${count} blog posts`)
}

async function main() {
  await seedBlogPosts()
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
