import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// The real checkout route, pricing, stock and order transaction on an in-memory PostgreSQL.
// Only e-mail delivery and the Paysera HTTP API are replaced; the Paysera client itself runs,
// so the amount checked below is the one that would be sent to the bank.
const { jar, mail, paysera } = vi.hoisted(() => ({
  jar: { session: undefined as string | undefined },
  mail: [] as Array<{ to: string; html: string }>,
  paysera: [] as number[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }))
vi.mock('@/lib/mailer', () => ({ sendEmail: async (to: string, _subject: string, html: string) => { mail.push({ to, html }) } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'eshop_session' && jar.session ? { value: jar.session } : undefined) }),
}))

const BASE = 781
// Mirrors the production chair: two required groups, adjustments on the base.
const CHAIR_GROUPS = [
  { name: 'Bāze', required: true, options: [
    { value: 'BASE XT', priceAdjustment: -42.5 }, { value: 'BASE XM', priceAdjustment: 46.04 }, { value: 'BASE XC', priceAdjustment: 0, preselected: true },
  ] },
  { name: 'Krāsa', required: true, options: [{ value: 'Black', preselected: true }, { value: 'White', priceAdjustment: 10.1 }] },
]

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let createSession: typeof import('@/lib/server-auth').createSession
let ordersRoute: typeof import('@/app/api/orders/route').POST
let repeatRoute: typeof import('@/app/api/orders/[id]/repeat/route').POST
let updateServerOrderByAdmin: typeof import('@/lib/orders-data-store').updateServerOrderByAdmin
let realFetch: typeof fetch

const freePort = (): Promise<number> => new Promise((resolve) => {
  const probe = createServer()
  probe.listen(0, '127.0.0.1', () => { const p = (probe.address() as { port: number }).port; probe.close(() => resolve(p)) })
})
const choose = (base: string, color = 'Black') => [{ groupName: 'Bāze', value: base }, { groupName: 'Krāsa', value: color }]

function orderBody(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    order: {
      firstName: 'Test', lastName: 'Buyer', email: 'buyer@example.test', phone: '+37120000000',
      address: 'Rencēnu 10A', city: 'Riga', postalCode: 'LV-1073', country: 'LV',
      legalDetails: { customerType: 'individual' }, deliveryMethod: 'pickup', pickupStoreId: 'riga-office',
      paymentMethod: 'bank', language: 'lv', items, ...extra,
    },
  }
}
let requestCount = 0
async function placeOrder(items: unknown[], extra: Record<string, unknown> = {}) {
  const response = await ordersRoute(new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${++requestCount % 250}` },
    body: JSON.stringify(orderBody(items, extra)),
  }))
  return { status: response.status, body: await response.json() as OrderResponse }
}
type OrderResponse = { orderId: string; order: { total: number }; paymentUrl?: string; error?: string }
type StoredLine = { price: number; variantLabel?: string; lineKey?: string; selectedVariants: Array<{ groupName: string; value: string; priceAdjustment?: number }> }
const storedOrder = async (id: string) => db.order.findUniqueOrThrow({ where: { id } })

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test'
  const dir = mkdtempSync(path.join(tmpdir(), 'variant-pricing-'))
  const file = path.join(dir, 'schema.sql')
  execFileSync(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', file], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  pg = new PGlite()
  await pg.exec(readFileSync(file, 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()

  db = (await import('@/lib/prisma')).prisma
  createSession = (await import('@/lib/server-auth')).createSession
  ordersRoute = (await import('@/app/api/orders/route')).POST
  repeatRoute = (await import('@/app/api/orders/[id]/repeat/route')).POST
  updateServerOrderByAdmin = (await import('@/lib/orders-data-store')).updateServerOrderByAdmin

  realFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input)
    if (!target.startsWith('https://api.paysera.com/')) return realFetch(input, init)
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    if (target.includes('/token')) return json({ access_token: 't', expires_in: 3600 })
    if (target.includes('/orders?')) return json({ items: [] })
    const body = JSON.parse(String(init?.body ?? '{}')) as { purchase?: { amount?: number } }
    paysera.push(Number(body.purchase?.amount))
    if (target.includes('/orders')) return json({ order_id: `po-${paysera.length}` })
    return json({ payment_URL: 'https://bank.paysera.test/pay' })
  })

  await db.keyValueSetting.create({ data: { key: 'grins-prices-only-maintenance', value: { checkoutClosed: false } } })
  const product = { brand: 'Chair Brand', category: 'equipment', image: '/chair.png', stock: 100, isActive: true, isDeleted: false, images: [], badges: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [] }
  await db.product.create({ data: { ...product, id: 'chair', title: 'PANDA GALAXY BASIC', sku: 'MEB116', price: BASE, technicalSpecs: { __variantGroupsJson: JSON.stringify(CHAIR_GROUPS) } } })
  await db.product.create({ data: { ...product, id: 'cheap', title: 'Cheap', price: 40, technicalSpecs: { __variantGroupsJson: JSON.stringify([{ name: 'Size', required: false, options: [{ value: 'Free', priceAdjustment: -40 }, { value: 'Below', priceAdjustment: -50 }, { value: 'Small', priceAdjustment: -4.65 }] }]) } } })
  await db.product.create({ data: { ...product, id: 'plain', title: 'Plain', price: 25.5 } })
  await db.user.create({ data: { id: 'buyer', email: 'buyer@example.test', passwordHash: 'x', platformRole: 'customer', bonusPoints: 0 } })
  await db.user.create({ data: { id: 'staff', email: 'staff@example.test', passwordHash: 'x', platformRole: 'admin' } })
}, 120_000)

afterAll(async () => {
  vi.unstubAllGlobals()
  await db?.$disconnect(); await socket?.stop(); await pg?.close()
})

beforeEach(async () => {
  // The confirmation e-mail is sent after the response: let the previous test's one land first.
  await new Promise((resolve) => setTimeout(resolve, 50))
  mail.length = 0
  paysera.length = 0
  vi.unstubAllEnvs()
  await db.rateLimit.deleteMany({})
  await db.promoCode.deleteMany({})
  await db.keyValueSetting.deleteMany({ where: { key: 'promo-campaigns' } })
  await db.user.update({ where: { id: 'buyer' }, data: { bonusPoints: 0 } })
  jar.session = await createSession('buyer')
})

describe('a variant line is charged for the chosen configuration', () => {
  it.each([
    ['positive adjustment', 'BASE XM', 827.04],
    ['negative adjustment', 'BASE XT', 738.5],
    ['zero adjustment', 'BASE XC', 781],
  ])('%s', async (_name, base, unit) => {
    const { status, body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose(base) }])
    expect(status).toBe(200)
    const order = await storedOrder(body.orderId)
    const [line] = order.items as StoredLine[]
    expect(line.price).toBe(unit)
    expect(Number(order.subtotal)).toBe(unit)
    expect(Number(order.total)).toBe(unit)
    expect(line.variantLabel).toBe(`Bāze: ${base}, Krāsa: Black`)
    expect(line.selectedVariants[0]).toMatchObject({ groupName: 'Bāze', value: base })
  })

  it('adds every chosen option and multiplies by the quantity, in exact cents', async () => {
    const { body } = await placeOrder([
      { id: 'chair', quantity: 3, selectedVariants: choose('BASE XM', 'White') },
      { id: 'chair', quantity: 2, selectedVariants: choose('BASE XT') },
      { id: 'cheap', quantity: 3, selectedVariants: [{ groupName: 'Size', value: 'Small' }] },
    ])
    const order = await storedOrder(body.orderId)
    expect((order.items as Array<{ price: number }>).map((line) => line.price)).toEqual([837.14, 738.5, 35.35])
    // 3 × 837.14 + 2 × 738.50 + 3 × 35.35 = 2511.42 + 1477.00 + 106.05
    expect(Number(order.subtotal)).toBe(4094.47)
    expect(Number(order.total)).toBe(4094.47)
    expect(body.order.total).toBe(4094.47)
  })

  it('ignores a forged price, adjustment and label in the request', async () => {
    const forged = [{ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: -700 }, { groupName: 'Krāsa', value: 'Black', priceAdjustment: -81 }]
    const { status, body } = await placeOrder([{ id: 'chair', quantity: 1, price: 1, selectedVariants: forged, variantLabel: 'Bāze: BASE XT', lineKey: 'chair' }],
      { subtotal: 1, total: 1, discount: 780 })
    expect(status).toBe(200)
    const order = await storedOrder(body.orderId)
    const [line] = order.items as StoredLine[]
    expect(line.price).toBe(827.04)
    expect(line.selectedVariants).toEqual([{ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: 46.04 }, { groupName: 'Krāsa', value: 'Black' }])
    expect(line.variantLabel).toBe('Bāze: BASE XM, Krāsa: Black')
    expect(line.lineKey).toBe('chair::Bāze=BASE XM,Krāsa=Black')
    expect(Number(order.total)).toBe(827.04)
  })

  it.each([
    ['an option the product does not have', [{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XZ') }]],
    ['a group the product does not have', [{ id: 'chair', quantity: 1, selectedVariants: [...choose('BASE XM'), { groupName: 'Motor', value: 'Turbo' }] }]],
    ['a required group left open', [{ id: 'chair', quantity: 1, selectedVariants: [{ groupName: 'Bāze', value: 'BASE XM' }] }]],
    ['no choice at all for a product with required groups', [{ id: 'chair', quantity: 1 }]],
    ['the same group twice', [{ id: 'chair', quantity: 1, selectedVariants: [...choose('BASE XT'), { groupName: 'Bāze', value: 'BASE XM' }] }]],
    ['an option that makes the unit free', [{ id: 'cheap', quantity: 1, selectedVariants: [{ groupName: 'Size', value: 'Free' }] }]],
    ['an option that makes the unit negative', [{ id: 'cheap', quantity: 1, selectedVariants: [{ groupName: 'Size', value: 'Below' }] }]],
  ])('refuses %s, and nothing is stored', async (_name, items) => {
    const before = await db.order.count()
    const { status, body } = await placeOrder(items)
    expect(status).toBe(400)
    expect(body.error).toBe('invalid_variant')
    expect(await db.order.count()).toBe(before)
    expect(mail).toEqual([])
  })

  it('refuses a guest even with a valid configuration', async () => {
    jar.session = undefined
    const before = await db.order.count()
    const { status } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    expect(status).toBe(401)
    expect(await db.order.count()).toBe(before)
  })
})

describe('discounts, bonuses and payment use the configured price', () => {
  it('a promo code discounts the configured price', async () => {
    await db.promoCode.create({ data: { id: 'promo-ten', code: 'TEN', discount: 10, active: true } })
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }], { promoCode: 'TEN' })
    const order = await storedOrder(body.orderId)
    expect(Number(order.discount)).toBe(82.7)
    expect(Number(order.total)).toBe(744.34)
  })

  it('a second-item campaign discounts the second configured unit', async () => {
    await db.keyValueSetting.create({ data: { key: 'promo-campaigns', value: [{
      id: 'second', name: 'Second', description: '', type: 'second_item_discount', discountPercent: 50,
      startDate: '2020-01-01', endDate: '2099-12-31', active: true, targetCategories: [], targetSubcategories: [],
      targetBrands: ['Chair Brand'], minOrderAmount: 0, createdAt: '2020-01-01', updatedAt: '2020-01-01',
    }] } })
    const { body } = await placeOrder([{ id: 'chair', quantity: 2, selectedVariants: choose('BASE XM') }])
    const order = await storedOrder(body.orderId)
    expect(Number(order.subtotal)).toBe(1654.08)
    expect(Number(order.discount)).toBe(413.52)
    expect(Number(order.total)).toBe(1240.56)
  })

  it('bonus points are spent and earned on the configured price', async () => {
    await db.user.update({ where: { id: 'buyer' }, data: { bonusPoints: 5000 } })
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }], { bonusSpent: 5000 })
    const order = await storedOrder(body.orderId)
    expect(order.bonusSpent).toBe(5000)
    expect(Number(order.total)).toBe(777.04)
    // 0.5 % of 827.04, scaled by the paid share 777.04 / 827.04.
    expect(order.bonusEarned).toBe(Math.round(Math.round(827.04 * 0.5) * 777.04 / 827.04))
    // All 5000 points were spent; what is left is what this order earned.
    expect((await db.user.findUniqueOrThrow({ where: { id: 'buyer' } })).bonusPoints).toBe(order.bonusEarned)
  })

  it('Paysera is asked for exactly the order total, and the confirmation states the same total', async () => {
    vi.stubEnv('PAYSERA_CHECKOUT_ENABLED', 'true')
    vi.stubEnv('PAYSERA_CLIENT_ID', 'id')
    vi.stubEnv('PAYSERA_CLIENT_SECRET', 'secret')
    vi.stubEnv('PAYSERA_PROJECT_ID', 'project')
    const { status, body } = await placeOrder([{ id: 'chair', quantity: 2, selectedVariants: choose('BASE XM', 'White') }], { paymentMethod: 'paysera' })
    expect(status).toBe(200)
    expect(body.paymentUrl).toBe('https://bank.paysera.test/pay')
    const order = await storedOrder(body.orderId)
    expect(Number(order.total)).toBe(1674.28)
    expect(body.order.total).toBe(1674.28)
    expect(paysera).toEqual([167428, 167428])
    await vi.waitFor(() => expect(mail.length).toBe(1))
    expect(mail[0].html).toContain('€1674.28')
  })
})

describe('after the order', () => {
  it('a staff edit keeps the configuration and its price, and cannot swap it', async () => {
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    const placed = await storedOrder(body.orderId)
    const [line] = placed.items as Array<{ lineKey: string }>
    const updated = await updateServerOrderByAdmin(body.orderId, {
      items: [{ id: 'chair', quantity: 2, lineKey: line.lineKey, variantLabel: 'Bāze: BASE XT' }],
      address: 'Rencēnu 10A', city: 'Riga', deliveryMethod: 'pickup', pickupStoreId: 'riga-office',
    }, { id: 'staff', email: 'staff@example.test', platformRole: 'admin' } as never, new NextRequest('http://localhost/api/admin/orders'))
    expect(updated.items[0]).toMatchObject({ price: 827.04, quantity: 2, variantLabel: 'Bāze: BASE XM, Krāsa: Black' })
    expect(updated.items[0].selectedVariants?.[0]).toEqual({ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: 46.04 })
    expect(updated.subtotal).toBe(1654.08)
  })

  it('repeating an order puts the same configuration back at its current price', async () => {
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    const response = await repeatRoute(new NextRequest(`http://localhost/api/orders/${body.orderId}/repeat`, { method: 'POST' }), { params: Promise.resolve({ id: body.orderId }) })
    const { items, changes } = await response.json() as { items: Array<{ price: number; lineKey: string; selectedVariants: unknown[] }>; changes: unknown[] }
    expect(items[0].price).toBe(827.04)
    expect(items[0].lineKey).toBe('chair::Bāze=BASE XM,Krāsa=Black')
    expect(changes).toEqual([])
  })

  it('repeating an order uses the option price as it is now, not the one stored in the old order', async () => {
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    const repriced = CHAIR_GROUPS.map((group) => group.name !== 'Bāze' ? group : {
      ...group, options: group.options.map((option) => option.value === 'BASE XM' ? { ...option, priceAdjustment: 60 } : option),
    })
    await db.product.update({ where: { id: 'chair' }, data: { technicalSpecs: { __variantGroupsJson: JSON.stringify(repriced) } } })
    try {
      const response = await repeatRoute(new NextRequest(`http://localhost/api/orders/${body.orderId}/repeat`, { method: 'POST' }), { params: Promise.resolve({ id: body.orderId }) })
      const { items, changes } = await response.json() as { items: Array<{ price: number }>; changes: Array<{ type: string; oldValue: number; newValue: number }> }
      expect(items[0].price).toBe(841)
      expect(changes).toEqual([expect.objectContaining({ type: 'price_changed', oldValue: 827.04, newValue: 841 })])
      // And checkout charges that same current price.
      const repeat = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
      expect(Number((await storedOrder(repeat.body.orderId)).total)).toBe(841)
    } finally {
      await db.product.update({ where: { id: 'chair' }, data: { technicalSpecs: { __variantGroupsJson: JSON.stringify(CHAIR_GROUPS) } } })
    }
  })

  it('an option removed since the order is reported unavailable on repeat', async () => {
    const { body } = await placeOrder([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XT') }])
    const without = CHAIR_GROUPS.map((group) => group.name !== 'Bāze' ? group : { ...group, options: group.options.filter((option) => option.value !== 'BASE XT') })
    await db.product.update({ where: { id: 'chair' }, data: { technicalSpecs: { __variantGroupsJson: JSON.stringify(without) } } })
    try {
      const response = await repeatRoute(new NextRequest(`http://localhost/api/orders/${body.orderId}/repeat`, { method: 'POST' }), { params: Promise.resolve({ id: body.orderId }) })
      const { items, unavailableItems } = await response.json() as { items: unknown[]; unavailableItems: Array<{ id: string }> }
      expect(items).toEqual([])
      expect(unavailableItems).toEqual([expect.objectContaining({ id: 'chair' })])
    } finally {
      await db.product.update({ where: { id: 'chair' }, data: { technicalSpecs: { __variantGroupsJson: JSON.stringify(CHAIR_GROUPS) } } })
    }
  })
})

describe('staff editing an order', () => {
  type EditLine = { id: string; quantity: number; lineKey?: string; variantLabel?: string; selectedVariants?: unknown }
  const STAFF = { id: 'staff', email: 'staff@example.test', platformRole: 'admin' } as never
  const edit = (orderId: string, items: EditLine[]) => updateServerOrderByAdmin(orderId, {
    items: items as never, address: 'Rencēnu 10A', city: 'Riga', deliveryMethod: 'pickup', pickupStoreId: 'riga-office',
  }, STAFF, new NextRequest('http://localhost/api/admin/orders'))
  const linesOf = async (orderId: string) => (await storedOrder(orderId)).items as StoredLine[]
  const stockOf = async (id: string) => (await db.product.findUniqueOrThrow({ where: { id } })).stock
  async function placed(items: unknown[], extra: Record<string, unknown> = {}) {
    const { status, body } = await placeOrder(items, extra)
    expect(status).toBe(200)
    return { id: body.orderId, lines: await linesOf(body.orderId) }
  }

  it.each([
    ['positive', choose('BASE XM', 'White'), 837.14],
    ['negative', choose('BASE XT'), 738.5],
  ])('adds a chair with a %s adjustment priced from the DB, keeping the ordered line', async (_name, selected, unit) => {
    const order = await placed([{ id: 'plain', quantity: 2 }])
    const updated = await edit(order.id, [
      { id: 'plain', quantity: 2, lineKey: order.lines[0].lineKey },
      { id: 'chair', quantity: 1, lineKey: 'chair', selectedVariants: selected },
    ])
    expect(updated.items.map((line) => line.price)).toEqual([25.5, unit])
    expect(updated.items[1].lineKey).toBe(`chair::${selected.map((v) => `${v.groupName}=${v.value}`).join(',')}`)
    expect(updated.items[1].variantLabel).toBe(selected.map((v) => `${v.groupName}: ${v.value}`).join(', '))
    expect(updated.subtotal).toBe(Math.round((51 + unit) * 100) / 100)
    expect(updated.total).toBe(updated.subtotal)
  })

  it.each([
    ['no options at all', undefined],
    ['a required group left open', [{ groupName: 'Bāze', value: 'BASE XM' }]],
    ['an option the chair does not have', choose('BASE XZ')],
  ])('refuses a chair added with %s, and changes nothing', async (_name, selected) => {
    const order = await placed([{ id: 'plain', quantity: 1 }])
    const before = await storedOrder(order.id)
    const stock = await stockOf('chair')
    await expect(edit(order.id, [
      { id: 'plain', quantity: 1, lineKey: order.lines[0].lineKey },
      { id: 'chair', quantity: 1, lineKey: 'chair', selectedVariants: selected },
    ])).rejects.toMatchObject({ code: 'invalid_variant' })
    const after = await storedOrder(order.id)
    expect(after.items).toEqual(before.items)
    expect(Number(after.total)).toBe(Number(before.total))
    expect(await stockOf('chair')).toBe(stock)
  })

  it('refuses an added option that leaves no price', async () => {
    const order = await placed([{ id: 'plain', quantity: 1 }])
    await expect(edit(order.id, [
      { id: 'plain', quantity: 1, lineKey: order.lines[0].lineKey },
      { id: 'cheap', quantity: 1, selectedVariants: [{ groupName: 'Size', value: 'Free' }] },
    ])).rejects.toMatchObject({ code: 'invalid_variant' })
  })

  it('ignores a forged price, adjustment, label and key on an added line', async () => {
    const order = await placed([{ id: 'plain', quantity: 1 }])
    const updated = await edit(order.id, [
      { id: 'plain', quantity: 1, lineKey: order.lines[0].lineKey },
      {
        id: 'chair', quantity: 1, lineKey: 'chair::forged', variantLabel: 'Bāze: BASE XT',
        price: 1, priceAdjustment: -780,
        selectedVariants: [{ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: -700 }, { groupName: 'Krāsa', value: 'Black', priceAdjustment: -81 }],
      } as EditLine,
    ])
    expect(updated.items[1]).toMatchObject({
      price: 827.04, lineKey: 'chair::Bāze=BASE XM,Krāsa=Black', variantLabel: 'Bāze: BASE XM, Krāsa: Black',
      selectedVariants: [{ groupName: 'Bāze', value: 'BASE XM', priceAdjustment: 46.04 }, { groupName: 'Krāsa', value: 'Black' }],
    })
    expect(updated.subtotal).toBe(852.54)
  })

  it('a quantity change keeps the ordered configuration, and a request cannot swap it', async () => {
    const order = await placed([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    const updated = await edit(order.id, [
      { id: 'chair', quantity: 3, lineKey: order.lines[0].lineKey, variantLabel: 'Bāze: BASE XT', selectedVariants: choose('BASE XT') },
    ])
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0]).toMatchObject({ quantity: 3, price: 827.04, lineKey: order.lines[0].lineKey, variantLabel: 'Bāze: BASE XM, Krāsa: Black' })
    expect(updated.subtotal).toBe(2481.12)
  })

  it('removing one configuration and adding another re-totals the order', async () => {
    const order = await placed([
      { id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') },
      { id: 'chair', quantity: 2, selectedVariants: choose('BASE XT') },
    ])
    const stock = await stockOf('chair')
    const updated = await edit(order.id, [
      { id: 'chair', quantity: 2, lineKey: order.lines[1].lineKey },
      { id: 'chair', quantity: 1, selectedVariants: choose('BASE XC', 'White') },
    ])
    expect(updated.items.map((line) => [line.variantLabel, line.price, line.quantity])).toEqual([
      ['Bāze: BASE XT, Krāsa: Black', 738.5, 2],
      ['Bāze: BASE XC, Krāsa: White', 791.1, 1],
    ])
    expect(updated.subtotal).toBe(2268.1)
    expect(updated.total).toBe(2268.1)
    // 3 units were held, still 3 after the swap.
    expect(await stockOf('chair')).toBe(stock)
  })

  it('refuses the same line twice', async () => {
    const order = await placed([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }])
    await expect(edit(order.id, [
      { id: 'chair', quantity: 1, lineKey: order.lines[0].lineKey },
      { id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') },
    ])).rejects.toMatchObject({ code: 'invalid_item' })
  })

  it('a promo discount is rescaled, not applied again, and stays put on a repeated edit', async () => {
    await db.promoCode.create({ data: { id: 'promo-ten-edit', code: 'TEN', discount: 10, active: true } })
    const order = await placed([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }], { promoCode: 'TEN' })
    expect(Number((await storedOrder(order.id)).discount)).toBe(82.7)
    const twice = await edit(order.id, [{ id: 'chair', quantity: 2, lineKey: order.lines[0].lineKey }])
    expect(twice).toMatchObject({ subtotal: 1654.08, discount: 165.4, total: 1488.68 })
    const again = await edit(order.id, [{ id: 'chair', quantity: 2, lineKey: order.lines[0].lineKey }])
    expect(again).toMatchObject({ subtotal: 1654.08, discount: 165.4, total: 1488.68 })
  })

  it('spent bonus points are kept, never debited again, and the balance does not move', async () => {
    await db.user.update({ where: { id: 'buyer' }, data: { bonusPoints: 5000 } })
    const order = await placed([{ id: 'chair', quantity: 1, selectedVariants: choose('BASE XM') }], { bonusSpent: 5000 })
    const balance = (await db.user.findUniqueOrThrow({ where: { id: 'buyer' } })).bonusPoints
    const updated = await edit(order.id, [
      { id: 'chair', quantity: 1, lineKey: order.lines[0].lineKey },
      { id: 'chair', quantity: 1, selectedVariants: choose('BASE XT') },
    ])
    expect(updated.bonusSpent).toBe(5000)
    expect(updated.subtotal).toBe(1565.54)
    expect(updated.total).toBe(1515.54)
    expect((await db.user.findUniqueOrThrow({ where: { id: 'buyer' } })).bonusPoints).toBe(balance)
  })
})
