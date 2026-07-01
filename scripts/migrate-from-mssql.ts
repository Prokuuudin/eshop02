/**
 * Step 2 of migration: JSON files → Neon (Prisma)
 *
 * First run: powershell scripts/export-mssql-to-json.ps1
 * Then run:  npx tsx scripts/migrate-from-mssql.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import * as bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const DATA = 'C:/Temp/migration'
const BATCH = 500

function load<T>(name: string): T[] {
  const raw = readFileSync(`${DATA}/${name}.json`, 'utf8').trim()
  if (!raw || raw === 'NULL') return []
  try {
    // sqlcmd inserts \r\n every ~2034 bytes regardless of JSON context
    // FOR JSON PATH produces single-line JSON, so all newlines are artifacts
    const noWraps = raw.replace(/\r\n|\r|\n/g, '')
    // strip remaining control chars (HTML descriptions may have tabs etc.)
    const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
    const parsed = JSON.parse(sanitized)
    if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed.data as T[]
    if (Array.isArray(parsed)) return parsed as T[]
    return []
  } catch (e) {
    console.error(`  [load] failed to parse ${name}.json:`, (e as Error).message)
    return []
  }
}

const dbPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  max: 3,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(dbPool) })

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      const retriable = e?.message?.includes('connection error') ||
        e?.message?.includes('Connection terminated') ||
        e?.message?.includes('not queryable') ||
        e?.code === 'P1001'
      if (retriable && attempt < 5) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      } else {
        throw e
      }
    }
  }
  throw new Error('unreachable')
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

// ── Category mapping ──────────────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  'ŠAMPŪNI': 'hair', 'VEIDOŠANAS LĪDZEKĻI': 'hair', 'KONDICIONIERI': 'hair',
  'MATU PAPILDKOPŠANA': 'hair', 'MATU MASKAS': 'hair', 'MASKAS': 'hair',
  'MATU KRĀSOŠANAI UN BALINĀŠANAI': 'hair', 'BARBERSHOP KOSMĒTIKA': 'hair',
  'SEJAI': 'face', 'MAKE-UP AKSESUĀRI': 'face', 'DEKORATĪVĀ KOSMĒTIKA': 'face',
  'KĀJĀM': 'body', 'ROKĀM': 'body', 'ĶERMENIM': 'body',
  'SIEVIEŠU SMARŽAS': 'body', 'VĪRIEŠU SMARŽAS': 'body', 'PARFIMĒRIJA': 'body',
  'SOLĀRIJA KOSMĒTIKA': 'body', 'VAKSĀCIJA': 'body', 'EĻĻAS': 'body',
  'ĶEMMES UN MATU SUKAS': 'equipment', 'MATU GRIEŽAMĀ MAŠĪNA': 'equipment',
  'STYLING TOOLS': 'equipment', 'INSTRUMENTI': 'equipment',
  'MANIKĪRA PIEDERUMI': 'nails', 'NAGU LAKAS': 'nails', 'GĒLA LAKAS': 'nails',
  'UV GĒLS': 'nails', 'NAGU KOPŠANA': 'nails',
  'AKCIJAS': 'new', 'DĀVANAS': 'new', 'JAUNUMI': 'new',
}

function mapCategory(name: string | null): string {
  if (!name) return 'hair'
  return CATEGORY_MAP[name.trim().toUpperCase()] ?? 'hair'
}

function imgUrl(id: number, seo: string): string {
  return `https://hairshop.lv/content/images/thumbs/${id}_${seo}_550x0.jpg`
}

function mapPayStatus(id: number): string {
  if (id === 3) return 'paid'
  if (id === 4 || id === 5) return 'refunded'
  return 'unpaid'
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function makeSlug(text: string, suffix: string | number): string {
  return text.toLowerCase()
    .replace(/[āàáâ]/g, 'a').replace(/[čç]/g, 'c').replace(/[ēèé]/g, 'e')
    .replace(/[ģ]/g, 'g').replace(/[ī]/g, 'i').replace(/[ķ]/g, 'k')
    .replace(/[ļ]/g, 'l').replace(/[ņ]/g, 'n').replace(/[š]/g, 's')
    .replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    + '-' + suffix
}

// ── 1. Products ───────────────────────────────────────────────────────────────
async function migrateProducts() {
  console.log('\n[1/7] Products...')
  const products = load<any>('products')
  const images   = load<any>('product_images')
  const related  = load<any>('related_products')
  const crossSell = load<any>('crosssell_products')

  const imageMap: Record<string, string[]> = {}
  for (const r of images) {
    const pid = String(r.productId)
    if (!imageMap[pid]) imageMap[pid] = []
    imageMap[pid].push(imgUrl(r.picId, r.seoFilename))
  }

  const relatedMap: Record<string, string[]> = {}
  for (const r of related) {
    const pid = String(r.productId)
    if (!relatedMap[pid]) relatedMap[pid] = []
    relatedMap[pid].push(String(r.relatedId))
  }

  const crossSellMap: Record<string, string[]> = {}
  for (const r of crossSell) {
    const pid = String(r.productId)
    if (!crossSellMap[pid]) crossSellMap[pid] = []
    crossSellMap[pid].push(String(r.crossSellId))
  }

  const rows = products.map((p: any) => {
    const imgs = imageMap[String(p.id)] ?? []
    return {
      id: String(p.id),
      title: p.title || 'Untitled',
      description: p.description ? stripHtml(String(p.description)) : null,
      brand: p.brand || 'Unknown',
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      stock: Number(p.stock) || 0,
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      rating: Number(p.rating) || 0,
      ratingCount: Number(p.ratingCount) || 0,
      reviewCount: Number(p.ratingCount) || 0,
      image: imgs[0] ?? null,
      images: imgs,
      metaTitle: p.metaTitle ?? null,
      metaDescription: p.metaDescription ?? null,
      category: mapCategory(p.category),
      isActive: Boolean(p.isActive),
      isDeleted: false,
      isCustom: false,
      badges: p.markAsNew ? ['new'] : [],
      certificates: [],
      relatedProductIds: relatedMap[String(p.id)] ?? [],
      oftenBoughtTogether: crossSellMap[String(p.id)] ?? [],
      compatibleEquipment: [],
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }
  })

  let n = 0
  for (const batch of chunks(rows, BATCH)) {
    await withRetry(() =>
      prisma.product.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
    process.stdout.write(`  ${n}/${rows.length}\r`)
  }
  console.log(`  ✓ ${n} products`)
}

// ── 2. Users ──────────────────────────────────────────────────────────────────
async function migrateUsers() {
  console.log('\n[2/7] Users...')
  const users = load<any>('users')
  const defaultHash = await bcrypt.hash('Welcome1!', 10)

  const rows = users.map((u: any) => ({
    id: String(u.id),
    email: u.email,
    passwordHash: defaultHash,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
    phone: u.phone ?? null,
    platformRole: u.role === 'admin' ? 'admin' : 'customer',
    mustChangePassword: true,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.createdAt),
  }))

  let n = 0
  for (const batch of chunks(rows, BATCH)) {
    await withRetry(() =>
      prisma.user.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
    process.stdout.write(`  ${n}/${rows.length}\r`)
  }
  console.log(`  ✓ ${n} users (password: Welcome1!, mustChangePassword=true)`)
}

// ── 3. Orders ─────────────────────────────────────────────────────────────────
async function migrateOrders() {
  console.log('\n[3/7] Orders...')
  const orders  = load<any>('orders')
  const items   = load<any>('order_items')
  const guidMap = load<any>('customer_guid_map')

  const nopToGuid = new Map<number, string>()
  for (const r of guidMap) nopToGuid.set(Number(r.nopId), String(r.guid))

  const itemMap = new Map<number, object[]>()
  for (const i of items) {
    const oid = Number(i.orderId)
    if (!itemMap.has(oid)) itemMap.set(oid, [])
    itemMap.get(oid)!.push({
      id: String(i.productId),
      title: i.productName,
      sku: i.sku ?? null,
      quantity: Number(i.quantity),
      price: Number(i.price),
    })
  }

  const existingUserIds = new Set(
    (await withRetry(() => prisma.user.findMany({ select: { id: true } }))).map(u => u.id)
  )

  const rows = orders.map((o: any) => {
    const guid   = nopToGuid.get(Number(o.customerId))
    const userId = guid && existingUserIds.has(guid) ? guid : null
    return {
      id: String(o.id),
      createdAt: new Date(o.createdAt),
      items: itemMap.get(Number(o.nopId)) ?? [],
      subtotal: Number(o.subtotal) || 0,
      tax: Number(o.tax) || 0,
      delivery: Number(o.delivery) || 0,
      deliveryMethod: o.deliveryMethod || 'standard',
      paymentMethod: o.paymentMethod || 'unknown',
      discount: Number(o.discount) || 0,
      total: Number(o.total) || 0,
      firstName: o.firstName || '',
      lastName: o.lastName || '',
      email: o.email || '',
      phone: o.phone || '',
      address: o.address || '',
      city: o.city || '',
      postalCode: o.postalCode ?? null,
      paymentStatus: mapPayStatus(Number(o.paymentStatusId)),
      userId,
    }
  })

  let n = 0
  for (const batch of chunks(rows, BATCH)) {
    await withRetry(() =>
      prisma.order.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
    process.stdout.write(`  ${n}/${rows.length}\r`)
  }
  console.log(`  ✓ ${n} orders`)
}

// ── 4. Reviews ────────────────────────────────────────────────────────────────
async function migrateReviews() {
  console.log('\n[4/7] Reviews...')
  const rows = load<any>('reviews')

  const existingProductIds = new Set(
    (await withRetry(() => prisma.product.findMany({ select: { id: true } }))).map(p => p.id)
  )

  const valid = rows
    .filter((r: any) => existingProductIds.has(String(r.productId)))
    .map((r: any) => ({
      id: String(r.id),
      productId: String(r.productId),
      author: String(r.author || 'Customer').trim(),
      rating: Number(r.rating),
      title: r.title || 'Review',
      text: r.text || '',
      createdAt: new Date(r.createdAt),
      helpful: Number(r.helpful) || 0,
      status: 'approved',
    }))

  let n = 0
  for (const batch of chunks(valid, BATCH)) {
    await withRetry(() =>
      prisma.review.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
  }
  console.log(`  ✓ ${n} reviews`)
}

// ── 5. Blog posts ─────────────────────────────────────────────────────────────
async function migrateBlogPosts() {
  console.log('\n[5/7] Blog posts...')
  const rows = load<any>('blog_posts')

  const data = rows.map((b: any) => ({
    id: String(b.id),
    slug: makeSlug(b.title, b.id),
    title: b.title,
    excerpt: b.bodyOverview ? stripHtml(String(b.bodyOverview)).slice(0, 300) : '',
    content: b.body ? stripHtml(String(b.body)) : '',
    author: 'Admin',
    image: '/blog/default.jpg',
    category: 'news',
    readTime: Math.max(1, Math.ceil((b.body || '').length / 1500)),
    createdAt: new Date(b.createdAt),
    featured: false,
  }))

  let n = 0
  for (const batch of chunks(data, BATCH)) {
    await withRetry(() =>
      prisma.blogPost.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
  }
  console.log(`  ✓ ${n} blog posts`)
}

// ── 6. Addresses ──────────────────────────────────────────────────────────────
async function migrateSavedAddresses() {
  console.log('\n[6/7] Addresses...')
  const rows = load<any>('addresses')

  const data = rows.map((a: any) => ({
    id: String(a.id),
    email: a.email,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    phone: a.phone || '',
    address: a.address || '',
    city: a.city || '',
    postalCode: a.postalCode ?? null,
  }))

  let n = 0
  for (const batch of chunks(data, BATCH)) {
    await withRetry(() =>
      prisma.savedAddress.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
    process.stdout.write(`  ${n}/${data.length}\r`)
  }
  console.log(`  ✓ ${n} addresses`)
}

// ── 7. Promo codes ────────────────────────────────────────────────────────────
async function migratePromoCodes() {
  console.log('\n[7/7] Promo codes...')
  const rows = load<any>('promo_codes')

  const data = rows.map((d: any) => ({
    id: String(d.id),
    code: d.code,
    discount: d.usePercentage ? Number(d.discountPercentage) : Number(d.discountAmount) || 10,
    description: d.name || '',
    maxUses: d.limitTimes ?? null,
    usedCount: Number(d.usedCount) || 0,
    expiresAt: d.endDate ? new Date(d.endDate) : null,
    active: true,
  }))

  let n = 0
  for (const batch of chunks(data, BATCH)) {
    await withRetry(() =>
      prisma.promoCode.createMany({ data: batch, skipDuplicates: true })
    )
    n += batch.length
  }
  console.log(`  ✓ ${n} promo codes`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  try {
    await migrateProducts()
    await migrateUsers()
    await migrateOrders()
    await migrateReviews()
    await migrateBlogPosts()
    await migrateSavedAddresses()
    await migratePromoCodes()
    console.log(`\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } catch (err) {
    console.error('\n❌ Error:', err)
    process.exit(1)
  } finally {
    await dbPool.end()
  }
}

main()
