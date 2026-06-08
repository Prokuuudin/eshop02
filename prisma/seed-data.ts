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
type JsonOrder = {
  id: string
  createdAt: string
  items: any
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: string
  paymentMethod: string
  promoCode?: string
  discount: number
  total: number
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode?: string
  bonusSpent?: number
  bonusEarned?: number
  paymentStatus?: string
  paymentProvider?: string
  paymentSessionId?: string
}

type JsonReview = {
  id: string
  productId: string
  author: string
  rating: number
  title: string
  text: string
  createdAt: string
  helpful: number
  status: string
  adminReply?: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

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

async function seedOrders() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'orders.json'), 'utf-8')
  const orders = JSON.parse(raw) as JsonOrder[]
  let count = 0
  for (const o of orders) {
    await prisma.order.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        createdAt: new Date(o.createdAt),
        items: o.items,
        subtotal: o.subtotal,
        tax: o.tax,
        delivery: o.delivery,
        deliveryMethod: o.deliveryMethod,
        paymentMethod: o.paymentMethod,
        promoCode: o.promoCode ?? null,
        discount: o.discount ?? 0,
        total: o.total,
        firstName: o.firstName,
        lastName: o.lastName,
        email: o.email,
        phone: o.phone,
        address: o.address,
        city: o.city,
        postalCode: o.postalCode ?? null,
        bonusSpent: o.bonusSpent ?? null,
        bonusEarned: o.bonusEarned ?? null,
        paymentStatus: o.paymentStatus ?? 'unpaid',
        paymentProvider: o.paymentProvider ?? null,
        paymentSessionId: o.paymentSessionId ?? null,
      },
    })
    count++
  }
  console.log(`Seeded ${count} orders`)
}

async function seedReviews() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'reviews.json'), 'utf-8')
  const reviews = JSON.parse(raw) as JsonReview[]
  let count = 0
  for (const r of reviews) {
    await prisma.review.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        productId: r.productId,
        author: r.author,
        rating: r.rating,
        title: r.title,
        text: r.text,
        createdAt: new Date(r.createdAt),
        helpful: r.helpful ?? 0,
        status: r.status ?? 'approved',
        adminReply: r.adminReply,
      },
    })
    count++
  }
  console.log(`Seeded ${count} reviews`)
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
  await seedOrders()
  await seedReviews()
  await seedBlogPosts()
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
