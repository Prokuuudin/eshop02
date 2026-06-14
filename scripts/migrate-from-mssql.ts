/**
 * One-time migration: nopCommerce (MSSQL) → eshop02 (Neon / Prisma)
 *
 * Run:  npx tsx scripts/migrate-from-mssql.ts
 *
 * Migrates: Products, Users, Orders, Reviews, BlogPosts,
 *           SavedAddresses, PromoCodes
 *
 * Passwords: all users get bcrypt("Welcome1!") + mustChangePassword=true
 * Images:    constructed from hairshop.lv CDN URL pattern
 */

import * as sql from 'mssql'
import * as bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// ── SQL Server connection (Windows Auth) ──────────────────────────────────────
const SQL_CONFIG: sql.config = {
  server: 'localhost\\SQLEXPRESS',
  database: 'hairshop_p34s',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    encrypt: false,
  },
}

// ── Category mapping: nopCommerce name → eshop02 category id ─────────────────
const CATEGORY_MAP: Record<string, string> = {
  'ŠAMPŪNI': 'hair',
  'VEIDOŠANAS LĪDZEKĻI': 'hair',
  'KONDICIONIERI': 'hair',
  'MATU PAPILDKOPŠANA': 'hair',
  'MATU MASKAS': 'hair',
  'MASKAS': 'hair',
  'MATU KRĀSOŠANAI UN BALINĀŠANAI': 'hair',
  'BARBERSHOP KOSMĒTIKA': 'hair',
  'BARBERSHOP COSMETICS': 'hair',
  'SEJAI': 'face',
  'MAKE-UP AKSESUĀRI': 'face',
  'DEKORATĪVĀ KOSMĒTIKA': 'face',
  'SKROPSTU UN UZACU KOPŠANA': 'face',
  'KĀJĀM': 'body',
  'ROKĀM': 'body',
  'ĶERMENIM': 'body',
  'SIEVIEŠU SMARŽAS': 'body',
  'VĪRIEŠU SMARŽAS': 'body',
  'PARFIMĒRIJA': 'body',
  'SOLĀRIJA KOSMĒTIKA': 'body',
  'VAKSĀCIJA': 'body',
  'EĻĻAS': 'body',
  'ĶEMMES UN MATU SUKAS': 'equipment',
  'MATU GRIEŽAMĀ MAŠĪNA': 'equipment',
  'STYLING TOOLS': 'equipment',
  'INSTRUMENTI': 'equipment',
  'MANIKĪRA PIEDERUMI': 'nails',
  'NAGU LAKAS': 'nails',
  'GĒLA LAKAS': 'nails',
  'NAGU KOPŠANA': 'nails',
  'UV GĒLS': 'nails',
  'AKCIJAS': 'new',
  'DĀVANAS': 'new',
  'JAUNUMI': 'new',
}

function mapCategory(name: string | null): string {
  if (!name) return 'hair'
  const upper = name.trim().toUpperCase()
  return CATEGORY_MAP[upper] ?? 'hair'
}

function imageUrl(id: number, seoFilename: string): string {
  return `https://hairshop.lv/content/images/thumbs/${id}_${seoFilename}_550x0.jpg`
}

function mapPaymentStatus(id: number): string {
  // nopCommerce: 1=pending 2=authorized 3=paid 4=partiallyRefunded 5=refunded 6=voided
  if (id === 3) return 'paid'
  if (id === 4 || id === 5) return 'refunded'
  return 'unpaid'
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function slug(text: string, suffix: string | number): string {
  const s = text.toLowerCase()
    .replace(/[āàáâ]/g, 'a').replace(/[čç]/g, 'c').replace(/[ēèé]/g, 'e')
    .replace(/[ģ]/g, 'g').replace(/[ī]/g, 'i').replace(/[ķ]/g, 'k')
    .replace(/[ļ]/g, 'l').replace(/[ņ]/g, 'n').replace(/[š]/g, 's')
    .replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  return `${s}-${suffix}`
}

// ── 1. Products ───────────────────────────────────────────────────────────────
async function migrateProducts(pool: sql.ConnectionPool) {
  console.log('\n[1/7] Products...')

  const products = await pool.request().query<{
    id: string; title: string; description: string | null
    brand: string; price: number; oldPrice: number | null
    stock: number; sku: string | null; rating: number
    ratingCount: number; metaTitle: string | null
    metaDescription: string | null; category: string | null
    isActive: boolean; createdAt: Date; updatedAt: Date
  }>(`
    SELECT
      CAST(p.Id AS VARCHAR)                                        AS id,
      p.Name                                                       AS title,
      COALESCE(NULLIF(p.FullDescription,''), p.ShortDescription)   AS description,
      COALESCE(m.Name, 'Unknown')                                  AS brand,
      p.Price                                                      AS price,
      NULLIF(p.OldPrice, 0)                                        AS oldPrice,
      p.StockQuantity                                              AS stock,
      NULLIF(p.SKU,'')                                             AS sku,
      CASE WHEN p.ApprovedTotalReviews > 0
        THEN CAST(p.ApprovedRatingSum AS FLOAT) / p.ApprovedTotalReviews
        ELSE 0 END                                                 AS rating,
      p.ApprovedTotalReviews                                       AS ratingCount,
      p.MetaTitle                                                  AS metaTitle,
      p.MetaDescription                                            AS metaDescription,
      p.Published                                                  AS isActive,
      p.CreatedOnUtc                                               AS createdAt,
      p.UpdatedOnUtc                                               AS updatedAt,
      cat.Name                                                     AS category
    FROM Product p
    LEFT JOIN Product_Manufacturer_Mapping pmm ON pmm.ProductId = p.Id
    LEFT JOIN Manufacturer m ON m.Id = pmm.ManufacturerId AND m.Deleted = 0
    LEFT JOIN (
      SELECT pcm.ProductId, c.Name,
        ROW_NUMBER() OVER (PARTITION BY pcm.ProductId ORDER BY pcm.Id) AS rn
      FROM Product_Category_Mapping pcm
      JOIN Category c ON c.Id = pcm.CategoryId AND c.Deleted = 0 AND c.Published = 1
    ) cat ON cat.ProductId = p.Id AND cat.rn = 1
    WHERE p.Deleted = 0
  `)

  const imgs = await pool.request().query<{
    productId: number; picId: number; seoFilename: string
  }>(`
    SELECT ppm.ProductId AS productId, pic.Id AS picId, pic.SeoFilename AS seoFilename
    FROM Product_Picture_Mapping ppm
    JOIN Picture pic ON pic.Id = ppm.PictureId
    WHERE pic.SeoFilename IS NOT NULL AND pic.SeoFilename != ''
    ORDER BY ppm.ProductId, ppm.DisplayOrder
  `)

  const imageMap: Record<string, string[]> = {}
  for (const r of imgs.recordset) {
    const pid = String(r.productId)
    if (!imageMap[pid]) imageMap[pid] = []
    imageMap[pid].push(imageUrl(r.picId, r.seoFilename))
  }

  let n = 0
  for (const p of products.recordset) {
    const images = imageMap[p.id] ?? []
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        title: p.title || 'Untitled',
        description: p.description ? stripHtml(p.description) : null,
        brand: p.brand,
        price: Number(p.price) || 0,
        oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
        stock: Number(p.stock) || 0,
        sku: p.sku ?? null,
        rating: Number(p.rating) || 0,
        ratingCount: Number(p.ratingCount) || 0,
        reviewCount: Number(p.ratingCount) || 0,
        image: images[0] ?? null,
        images,
        metaTitle: p.metaTitle ?? null,
        metaDescription: p.metaDescription ?? null,
        category: mapCategory(p.category),
        isActive: Boolean(p.isActive),
        isDeleted: false,
        isCustom: false,
        badges: [],
        certificates: [],
        relatedProductIds: [],
        oftenBoughtTogether: [],
        compatibleEquipment: [],
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      },
    })
    n++
    if (n % 200 === 0) process.stdout.write(`  ${n}/${products.recordset.length}\r`)
  }
  console.log(`  ✓ ${n} products`)
}

// ── 2. Users ──────────────────────────────────────────────────────────────────
async function migrateUsers(pool: sql.ConnectionPool) {
  console.log('\n[2/7] Users...')
  const defaultHash = await bcrypt.hash('Welcome1!', 10)

  const users = await pool.request().query<{
    id: string; nopId: number; email: string
    firstName: string; lastName: string; phone: string | null
    createdAt: Date; role: string
  }>(`
    SELECT
      CAST(c.CustomerGuid AS VARCHAR(50))                            AS id,
      c.Id                                                           AS nopId,
      c.Email                                                        AS email,
      COALESCE(ga_fn.Value, '')                                      AS firstName,
      COALESCE(ga_ln.Value, '')                                      AS lastName,
      ga_ph.Value                                                    AS phone,
      c.CreatedOnUtc                                                 AS createdAt,
      CASE WHEN cr_adm.Customer_Id IS NOT NULL THEN 'admin'
           ELSE 'customer' END                                       AS role
    FROM Customer c
    LEFT JOIN GenericAttribute ga_fn
      ON ga_fn.EntityId = c.Id AND ga_fn.KeyGroup = 'Customer'
      AND ga_fn.[Key] = 'FirstName' AND ga_fn.StoreId = 0
    LEFT JOIN GenericAttribute ga_ln
      ON ga_ln.EntityId = c.Id AND ga_ln.KeyGroup = 'Customer'
      AND ga_ln.[Key] = 'LastName' AND ga_ln.StoreId = 0
    LEFT JOIN GenericAttribute ga_ph
      ON ga_ph.EntityId = c.Id AND ga_ph.KeyGroup = 'Customer'
      AND ga_ph.[Key] = 'Phone' AND ga_ph.StoreId = 0
    LEFT JOIN (
      SELECT ccrm.Customer_Id FROM Customer_CustomerRole_Mapping ccrm
      JOIN CustomerRole cr ON cr.Id = ccrm.CustomerRole_Id
        AND cr.SystemName = 'Administrators'
    ) cr_adm ON cr_adm.Customer_Id = c.Id
    WHERE c.Deleted = 0 AND c.IsSystemAccount = 0
      AND c.Email IS NOT NULL AND c.Email != ''
      AND c.PasswordFormatId = 1
  `)

  let n = 0
  for (const u of users.recordset) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || null
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        passwordHash: defaultHash,
        name,
        phone: u.phone ?? null,
        platformRole: u.role,
        mustChangePassword: true,
        createdAt: new Date(u.createdAt),
        updatedAt: new Date(u.createdAt),
      },
    })
    n++
    if (n % 500 === 0) process.stdout.write(`  ${n}/${users.recordset.length}\r`)
  }
  console.log(`  ✓ ${n} users (password: Welcome1!, mustChangePassword=true)`)
}

// ── 3. Orders ─────────────────────────────────────────────────────────────────
async function migrateOrders(pool: sql.ConnectionPool) {
  console.log('\n[3/7] Orders...')

  // nopId → guid map for user linking
  const guidMap = new Map<number, string>()
  const gm = await pool.request().query<{ nopId: number; guid: string }>(
    `SELECT c.Id AS nopId, CAST(c.CustomerGuid AS VARCHAR(50)) AS guid
     FROM Customer c WHERE c.Deleted = 0 AND c.IsSystemAccount = 0`
  )
  for (const r of gm.recordset) guidMap.set(r.nopId, r.guid)

  const orders = await pool.request().query<{
    id: string; nopId: number; customerId: number
    subtotal: number; tax: number; delivery: number
    deliveryMethod: string | null; paymentMethod: string | null
    discount: number; total: number; paymentStatusId: number
    firstName: string; lastName: string; email: string
    phone: string; address: string; city: string
    postalCode: string | null; createdAt: Date
  }>(`
    SELECT
      CAST(o.OrderGuid AS VARCHAR(50))   AS id,
      o.Id                               AS nopId,
      o.CustomerId                       AS customerId,
      o.OrderSubtotalExclTax             AS subtotal,
      o.OrderTax                         AS tax,
      o.OrderShippingExclTax             AS delivery,
      o.ShippingMethod                   AS deliveryMethod,
      o.PaymentMethodSystemName          AS paymentMethod,
      o.OrderDiscount                    AS discount,
      o.OrderTotal                       AS total,
      o.PaymentStatusId                  AS paymentStatusId,
      COALESCE(a.FirstName,'')           AS firstName,
      COALESCE(a.LastName,'')            AS lastName,
      COALESCE(c.Email,'')               AS email,
      COALESCE(a.PhoneNumber,'')         AS phone,
      COALESCE(a.Address1,'')            AS address,
      COALESCE(a.City,'')                AS city,
      a.ZipPostalCode                    AS postalCode,
      o.CreatedOnUtc                     AS createdAt
    FROM [Order] o
    LEFT JOIN Address a ON a.Id = o.BillingAddressId
    LEFT JOIN Customer c ON c.Id = o.CustomerId
    WHERE o.Deleted = 0
  `)

  const items = await pool.request().query<{
    orderId: number; quantity: number; price: number
    total: number; productId: number; productName: string; sku: string | null
  }>(`
    SELECT
      oi.OrderId      AS orderId,
      oi.Quantity     AS quantity,
      oi.UnitPriceExclTax AS price,
      oi.PriceExclTax     AS total,
      p.Id            AS productId,
      p.Name          AS productName,
      p.SKU           AS sku
    FROM OrderItem oi
    JOIN Product p ON p.Id = oi.ProductId
  `)

  const itemMap = new Map<number, object[]>()
  for (const i of items.recordset) {
    if (!itemMap.has(i.orderId)) itemMap.set(i.orderId, [])
    itemMap.get(i.orderId)!.push({
      id: String(i.productId),
      title: i.productName,
      sku: i.sku ?? null,
      quantity: i.quantity,
      price: Number(i.price),
    })
  }

  // Pre-fetch existing user IDs to avoid per-order DB lookups
  const existingUserIds = new Set(
    (await prisma.user.findMany({ select: { id: true } })).map(u => u.id)
  )

  let n = 0
  for (const o of orders.recordset) {
    const guid = guidMap.get(o.customerId)
    const userId = guid && existingUserIds.has(guid) ? guid : null

    await prisma.order.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        createdAt: new Date(o.createdAt),
        items: itemMap.get(o.nopId) ?? [],
        subtotal: Number(o.subtotal) || 0,
        tax: Number(o.tax) || 0,
        delivery: Number(o.delivery) || 0,
        deliveryMethod: o.deliveryMethod || 'standard',
        paymentMethod: o.paymentMethod || 'unknown',
        discount: Number(o.discount) || 0,
        total: Number(o.total) || 0,
        firstName: o.firstName,
        lastName: o.lastName,
        email: o.email,
        phone: o.phone,
        address: o.address,
        city: o.city,
        postalCode: o.postalCode ?? null,
        paymentStatus: mapPaymentStatus(o.paymentStatusId),
        userId,
      },
    })
    n++
    if (n % 500 === 0) process.stdout.write(`  ${n}/${orders.recordset.length}\r`)
  }
  console.log(`  ✓ ${n} orders`)
}

// ── 4. Reviews ────────────────────────────────────────────────────────────────
async function migrateReviews(pool: sql.ConnectionPool) {
  console.log('\n[4/7] Reviews...')

  const rows = await pool.request().query<{
    id: string; productId: string; author: string
    rating: number; title: string; text: string
    createdAt: Date; helpful: number
  }>(`
    SELECT
      CAST(pr.Id AS VARCHAR)                                         AS id,
      CAST(pr.ProductId AS VARCHAR)                                  AS productId,
      TRIM(COALESCE(ga_fn.Value + ' ' + ga_ln.Value, c.Email, 'Customer')) AS author,
      pr.Rating                                                      AS rating,
      COALESCE(NULLIF(pr.Title,''), 'Review')                        AS title,
      COALESCE(pr.ReviewText,'')                                     AS text,
      pr.CreatedOnUtc                                                AS createdAt,
      pr.HelpfulYesTotal                                             AS helpful
    FROM ProductReview pr
    JOIN Customer c ON c.Id = pr.CustomerId
    LEFT JOIN GenericAttribute ga_fn
      ON ga_fn.EntityId = c.Id AND ga_fn.KeyGroup = 'Customer'
      AND ga_fn.[Key] = 'FirstName' AND ga_fn.StoreId = 0
    LEFT JOIN GenericAttribute ga_ln
      ON ga_ln.EntityId = c.Id AND ga_ln.KeyGroup = 'Customer'
      AND ga_ln.[Key] = 'LastName' AND ga_ln.StoreId = 0
    WHERE pr.IsApproved = 1
  `)

  const existingProducts = new Set(
    (await prisma.product.findMany({ select: { id: true } })).map(p => p.id)
  )

  let n = 0
  for (const r of rows.recordset) {
    if (!existingProducts.has(r.productId)) continue
    await prisma.review.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        productId: r.productId,
        author: r.author || 'Customer',
        rating: Number(r.rating),
        title: r.title,
        text: r.text,
        createdAt: new Date(r.createdAt),
        helpful: Number(r.helpful) || 0,
        status: 'approved',
      },
    })
    n++
  }
  console.log(`  ✓ ${n} reviews`)
}

// ── 5. Blog posts ─────────────────────────────────────────────────────────────
async function migrateBlogPosts(pool: sql.ConnectionPool) {
  console.log('\n[5/7] Blog posts...')

  const rows = await pool.request().query<{
    id: number; title: string; body: string
    bodyOverview: string | null; createdAt: Date
    metaTitle: string | null; metaDescription: string | null
  }>(`
    SELECT Id, Title, Body, BodyOverview, CreatedOnUtc AS createdAt,
      MetaTitle, MetaDescription
    FROM BlogPost
    WHERE StartDateUtc IS NULL OR StartDateUtc <= GETUTCDATE()
  `)

  let n = 0
  for (const b of rows.recordset) {
    const postSlug = slug(b.title, b.id)
    await prisma.blogPost.upsert({
      where: { slug: postSlug },
      update: {},
      create: {
        id: String(b.id),
        slug: postSlug,
        title: b.title,
        excerpt: b.bodyOverview ? stripHtml(b.bodyOverview).slice(0, 300) : '',
        content: b.body ? stripHtml(b.body) : '',
        author: 'Admin',
        image: '/blog/default.jpg',
        category: 'news',
        readTime: Math.max(1, Math.ceil((b.body || '').length / 1500)),
        createdAt: new Date(b.createdAt),
        featured: false,
      },
    })
    n++
  }
  console.log(`  ✓ ${n} blog posts`)
}

// ── 6. Saved addresses ────────────────────────────────────────────────────────
async function migrateSavedAddresses(pool: sql.ConnectionPool) {
  console.log('\n[6/7] Saved addresses...')

  const rows = await pool.request().query<{
    id: number; email: string; firstName: string; lastName: string
    phone: string; address: string; city: string; postalCode: string | null
  }>(`
    SELECT TOP 15000
      a.Id, a.Email, a.FirstName, a.LastName,
      COALESCE(a.PhoneNumber,'') AS phone,
      COALESCE(a.Address1,'')    AS address,
      COALESCE(a.City,'')        AS city,
      a.ZipPostalCode            AS postalCode
    FROM Address a
    WHERE a.Email IS NOT NULL AND a.Email != ''
      AND a.FirstName IS NOT NULL AND a.FirstName != ''
      AND a.Address1 IS NOT NULL AND a.Address1 != ''
  `)

  let n = 0
  for (const a of rows.recordset) {
    await prisma.savedAddress.upsert({
      where: { id: String(a.id) },
      update: {},
      create: {
        id: String(a.id),
        email: a.email,
        firstName: a.firstName,
        lastName: a.lastName,
        phone: a.phone,
        address: a.address,
        city: a.city,
        postalCode: a.postalCode ?? null,
      },
    })
    n++
    if (n % 1000 === 0) process.stdout.write(`  ${n}/${rows.recordset.length}\r`)
  }
  console.log(`  ✓ ${n} addresses`)
}

// ── 7. Promo codes ────────────────────────────────────────────────────────────
async function migratePromoCodes(pool: sql.ConnectionPool) {
  console.log('\n[7/7] Promo codes...')

  const rows = await pool.request().query<{
    id: number; code: string; name: string
    usePercentage: boolean; discountPercentage: number
    discountAmount: number; endDate: Date | null
    limitTimes: number | null; usedCount: number
  }>(`
    SELECT
      d.Id, d.CouponCode AS code, d.Name AS name,
      d.UsePercentage    AS usePercentage,
      d.DiscountPercentage AS discountPercentage,
      d.DiscountAmount     AS discountAmount,
      d.EndDateUtc         AS endDate,
      d.LimitationTimes    AS limitTimes,
      (SELECT COUNT(*) FROM DiscountUsageHistory duh
       WHERE duh.DiscountId = d.Id)  AS usedCount
    FROM Discount d
    WHERE d.RequiresCouponCode = 1
      AND d.CouponCode IS NOT NULL AND d.CouponCode != ''
  `)

  let n = 0
  for (const d of rows.recordset) {
    const discountValue = d.usePercentage
      ? Number(d.discountPercentage)
      : Number(d.discountAmount)

    await prisma.promoCode.upsert({
      where: { code: d.code },
      update: {},
      create: {
        id: String(d.id),
        code: d.code,
        discount: discountValue || 10,
        description: d.name || '',
        maxUses: d.limitTimes ?? null,
        usedCount: Number(d.usedCount) || 0,
        expiresAt: d.endDate ? new Date(d.endDate) : null,
        active: true,
      },
    })
    n++
  }
  console.log(`  ✓ ${n} promo codes`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to SQL Server (localhost\\SQLEXPRESS)...')
  const pool = await sql.connect(SQL_CONFIG)
  console.log('Connected.\n')

  const t0 = Date.now()
  try {
    await migrateProducts(pool)
    await migrateUsers(pool)
    await migrateOrders(pool)
    await migrateReviews(pool)
    await migrateBlogPosts(pool)
    await migrateSavedAddresses(pool)
    await migratePromoCodes(pool)

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n✅ Migration complete in ${elapsed}s`)
  } catch (err) {
    console.error('\n❌ Migration error:', err)
    process.exit(1)
  } finally {
    await pool.close()
    await prisma.$disconnect()
  }
}

main()
