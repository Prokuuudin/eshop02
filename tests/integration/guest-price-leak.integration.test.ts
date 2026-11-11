import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real API route handlers and real rows on an in-memory PostgreSQL. HTML and the Next.js payload are
// covered by e2e/guest-price-leak.spec.ts; both assert on the raw response, as a scraper reads it.
const { jar } = vi.hoisted(() => ({ jar: { session: undefined as string | undefined } }))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'eshop_session' && jar.session ? { value: jar.session } : undefined) }),
}))

const AMOUNTS = ['7.74', '8,15', '9.20', '10.40', '46.04', '42.5', '31.99', '39.99', '25.5', '12.75']
const PRICE_WORDS = ['priceAdjustment', 'bulkPricingTiers', 'pricePerUnit', 'oldPrice']

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let createSession: typeof import('@/lib/server-auth').createSession
let productsRoute: typeof import('@/app/api/products/route').GET
let productRoute: typeof import('@/app/api/products/[id]/route').GET
let saleRoute: typeof import('@/app/api/products/sale/route').GET
let bestsellersRoute: typeof import('@/app/api/products/bestsellers/route').GET
let searchRoute: typeof import('@/app/api/search/route').GET

const freePort = (): Promise<number> => new Promise((resolve) => {
  const probe = createServer()
  probe.listen(0, '127.0.0.1', () => { const p = (probe.address() as { port: number }).port; probe.close(() => resolve(p)) })
})
const get = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { 'x-forwarded-for': '203.0.113.30' } })
const expectNoPrices = (body: string, label: string): void => {
  for (const amount of AMOUNTS) expect(body, `${label} contains ${amount}`).not.toContain(amount)
  for (const word of PRICE_WORDS) expect(body, `${label} contains ${word}`).not.toContain(word)
  expect(body, `${label} has a price field`).not.toMatch(/"price":/)
  expect(body, `${label} mentions a currency`).not.toMatch(/€|\bEUR\b|\beiro\b|евро/iu)
}
const guestResponses = async (): Promise<Array<[string, string]>> => [
  ['GET /api/products', await (await productsRoute(get('/api/products?take=50'))).text()],
  ['GET /api/products?ids', await (await productsRoute(get('/api/products?ids=leak-1,leak-2'))).text()],
  ['GET /api/products/leak-1', await (await productRoute(get('/api/products/leak-1'), { params: Promise.resolve({ id: 'leak-1' }) })).text()],
  ['GET /api/products/leak-2', await (await productRoute(get('/api/products/leak-2'), { params: Promise.resolve({ id: 'leak-2' }) })).text()],
  ['GET /api/products/sale', await (await saleRoute()).text()],
  ['GET /api/products/bestsellers', await (await bestsellersRoute()).text()],
  ['GET /api/search', await (await searchRoute(get('/api/search?q=Igora&take=5'))).text()],
]

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  const dir = mkdtempSync(path.join(tmpdir(), 'guest-price-'))
  const file = path.join(dir, 'schema.sql')
  execFileSync(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', file], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  pg = new PGlite()
  await pg.exec(readFileSync(file, 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()

  db = (await import('@/lib/prisma')).prisma
  createSession = (await import('@/lib/server-auth')).createSession
  productsRoute = (await import('@/app/api/products/route')).GET
  productRoute = (await import('@/app/api/products/[id]/route')).GET
  saleRoute = (await import('@/app/api/products/sale/route')).GET
  bestsellersRoute = (await import('@/app/api/products/bestsellers/route')).GET
  searchRoute = (await import('@/app/api/search/route')).GET

  const base = { brand: 'Schwarzkopf', category: 'hair', image: '/leak.png', stock: 100, isActive: true, isDeleted: false, badges: ['sale', 'bestseller'], images: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [] }
  await db.product.create({
    data: {
      ...base, id: 'leak-1', title: 'Igora краска', titleEn: 'Igora dye', titleLv: 'Igora krāsa',
      price: 31.99, oldPrice: 39.99, bulkPricingTiers: [{ quantity: 10, pricePerUnit: 25.5 }],
      description: 'Стойкая краска. Всего за 8,15 €. Объём 60 мл.',
      metaTitle: 'Igora за 9.20 €', metaDescription: 'Igora Royal matu krāsa tikai par 7.74 €. Matu krāsa 60ml.', ogAlt: 'Igora 10.40 EUR',
      technicalSpecs: { __descriptionEn: 'Great dye. Only €9.20 today. Lasts long.', __descriptionLv: 'Laba krāsa. Tikai 10.40 eiro. Ilgi turas.' },
    },
  })
  await db.product.create({
    data: {
      ...base, id: 'leak-2', title: 'Igora набор', titleEn: 'Igora set', titleLv: 'Igora komplekts', price: 781, oldPrice: 900,
      technicalSpecs: { __variantGroupsJson: JSON.stringify([{ name: 'Bāze', required: true, options: [{ value: 'XT', priceAdjustment: -42.5 }, { value: 'XM', priceAdjustment: 46.04 }, { value: 'XS', priceAdjustment: 12.75 }] }]) },
    },
  })
  await db.product.create({ data: { ...base, id: 'hidden-1', title: 'Hidden 30 EUR', price: 30, isActive: false } })
  // Bestsellers are computed from orders: without one the list is empty and proves nothing.
  await db.order.create({
    data: {
      id: 'order-1', createdAt: new Date(), items: [{ id: 'leak-1', quantity: 3 }], subtotal: 0, tax: 0, delivery: 0, total: 0,
      deliveryMethod: 'pickup', paymentMethod: 'cash', firstName: 'A', lastName: 'B', email: 'a@example.test', phone: '1', address: 'x', city: 'y',
    },
  })
}, 120_000)

afterAll(async () => { await db?.$disconnect(); await socket?.stop(); await pg?.close() })
beforeEach(async () => {
  jar.session = undefined
  await db.rateLimit.deleteMany({})
})

describe('a guest', () => {
  it('gets no price, adjustment or amount in text from any product API', async () => {
    const responses = await guestResponses()
    for (const [label, body] of responses) expectNoPrices(body, label)
    // And the products are really there: an empty answer would prove nothing.
    expect(responses[1][1]).toContain('Igora krāsa')
    expect(responses[2][1]).toContain('Объём 60 мл.')
    expect(responses[2][1]).toContain('Matu krāsa 60ml.')
    expect(responses[2][1]).toContain('Lasts long.')
    expect(responses[2][1]).toContain('Ilgi turas.')
    expect(responses[5][1]).toContain('leak-1')
    expect(responses[4][1]).toContain('leak-2')
    expect(responses[6][1]).toContain('Igora')
  })

  it('still gets variant names and images, so the choice is shown without prices', async () => {
    const res = await productRoute(get('/api/products/leak-2'), { params: Promise.resolve({ id: 'leak-2' }) })
    const { product } = await res.json() as { product: { technicalSpecs: { __variantGroupsJson: string } } }
    const groups = JSON.parse(product.technicalSpecs.__variantGroupsJson) as Array<{ name: string; required: boolean; options: Array<Record<string, unknown>> }>
    expect(groups[0]).toEqual({ name: 'Bāze', required: true, options: [{ value: 'XT' }, { value: 'XM' }, { value: 'XS' }] })
  })

  it('cannot reach an unpublished product at all', async () => {
    const res = await productRoute(get('/api/products/hidden-1'), { params: Promise.resolve({ id: 'hidden-1' }) })
    expect(res.status).toBe(404)
    const list = await (await productsRoute(get('/api/products?ids=hidden-1'))).text()
    expect(list).not.toContain('Hidden')
  })
})

describe('a signed-in client', () => {
  beforeEach(async () => {
    const user = await db.user.upsert({
      where: { id: 'client-1' },
      create: { id: 'client-1', email: 'client@example.test', passwordHash: 'x', platformRole: 'customer' },
      update: {},
    })
    jar.session = await createSession(user.id)
  })

  it('still sees prices, tiers and untouched text', async () => {
    const res = await productRoute(get('/api/products/leak-1'), { params: Promise.resolve({ id: 'leak-1' }) })
    const { product } = await res.json() as { product: Record<string, unknown> & { technicalSpecs: Record<string, string> } }
    expect(product.price).toBe(31.99)
    expect(product.oldPrice).toBe(39.99)
    expect(product.bulkPricingTiers).toEqual([{ quantity: 10, pricePerUnit: 25.5 }])
    expect(product.description).toBe('Стойкая краска. Всего за 8,15 €. Объём 60 мл.')
    expect(product.metaDescription).toContain('7.74 €')
    expect(product.technicalSpecs.__descriptionEn).toContain('€9.20')
  })

  it('still sees variant adjustments', async () => {
    const res = await productRoute(get('/api/products/leak-2'), { params: Promise.resolve({ id: 'leak-2' }) })
    const { product } = await res.json() as { product: { price: number; technicalSpecs: { __variantGroupsJson: string } } }
    expect(product.price).toBe(781)
    const groups = JSON.parse(product.technicalSpecs.__variantGroupsJson) as Array<{ options: Array<{ priceAdjustment: number }> }>
    expect(groups[0].options.map((o) => o.priceAdjustment)).toEqual([-42.5, 46.04, 12.75])
  })

  it('still gets prices from the lists', async () => {
    const list = await (await productsRoute(get('/api/products?ids=leak-1,leak-2'))).json() as { data: { products: Array<{ id: string; price: number }> } }
    expect(list.data.products.map((p) => p.price).sort((a, b) => a - b)).toEqual([31.99, 781])
    const sale = await (await saleRoute()).text()
    expect(sale).toContain('"price":31.99')
  })

  it('search suggestions never carry an amount, for anyone', async () => {
    await db.product.update({ where: { id: 'leak-1' }, data: { titleLv: 'Igora 7.74 €' } })
    const body = await (await searchRoute(get('/api/search?q=Igora&take=5&lang=lv'))).text()
    await db.product.update({ where: { id: 'leak-1' }, data: { titleLv: 'Igora krāsa' } })
    expect(body).not.toContain('7.74')
    expect(body).toContain('Igora')
  })
})
