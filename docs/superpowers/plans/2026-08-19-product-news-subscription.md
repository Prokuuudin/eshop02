# Product News Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the discount-based `ProductSubscription` auto-order system and the existing (but unmerged) `StockNotification` restock system, and replace both with a single `ProductNewsSubscription` — one subscription per (user, product) with three independent opt-in flags (price change / back in stock / promo), delivered through the existing `UserNotification` inbox pipeline.

**Architecture:** New Prisma model + `lib/product-news-notify.ts` (server-side fan-out into `UserNotification`) triggered from the existing admin product PUT route (price/stock diff) and a new admin-only promo-notify route. Client side gets one new zustand store + one widget (product page) + one account section, replacing the old subscription/stock-notify equivalents one-for-one. Checkout/orders/pricing lose all `subscriptionId`/`forcedDiscountPercent` plumbing.

**Tech Stack:** Next.js App Router, Prisma (Neon Postgres via `@prisma/adapter-neon`), Zustand, Vitest, Zod.

**Spec:** [docs/superpowers/specs/2026-08-19-product-news-subscription-design.md](../specs/2026-08-19-product-news-subscription-design.md)

## Correction to the spec

The spec claims `StockNotification`/`StockNotifyButton`/`AccountStockNotificationsSection` are dead code "never wired to any page." That was wrong — verified during planning:

- `StockNotifyButton` renders in `components/ProductCard.tsx:167`, `components/ProductListRow.tsx:123`, `components/ProductStock.tsx:17` (shown whenever `product.stock === 0`).
- `AccountStockNotificationsSection` renders in `app/[lang]/account/page.tsx:177`.
- `components/admin/products/ProductCard.tsx` (the admin catalog quick-edit card) already calls `useStockNotifyStore().notifyProduct(...)` client-side when an admin bumps stock from 0 to >0 via its inline stock field — but that call only ever appends a notification into the *admin's own* browser-local `notifications-store`, never the actual subscriber's. It never reached a real subscriber. It has 0 live rows in Neon (verified), so nobody has actually used it — but the UI is live and reachable today.

The merge decision (fold restock into the new unified widget) still stands — it's the right call regardless, since it avoids two competing "notify me" entry points once the new widget exists. But every task below that touches restock accounts for the real render sites, not a "delete an orphan" no-op.

## Global Constraints

- No guest/email subscriptions — `ProductNewsSubscription` requires a logged-in `userId` (channel is in-app only, per the approved design).
- Delivery is in-app only via the existing `UserNotification` → `/api/notifications/inbox` → `notifications-store.fetchInbox()` pipeline. Do not add a new delivery mechanism.
- Server-generated notification title/message text is plain Russian, not i18n keys — matches the existing `stock-notify-store.ts` `notifyProduct` precedent. Only *widget/account UI* copy goes through `t()`.
- Do NOT run `prisma migrate dev` — the shadow-DB history is broken (see `[[project_migration_workflow_broken]]`). Any schema change goes through `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → hand-written `migration.sql` → `prisma db execute` → `prisma migrate resolve --applied`, run manually, never left sitting in `prisma/migrations/` for `npm run build` to auto-apply until you intend it to apply *now*.
- Do NOT apply the migration to live Neon without a separate, explicit "yes, apply it now" from the user in this session — this is Task 17 and it is gated on that.
- Money fields stay plain `number` at every call site (the `moneyFieldsExtension` in `lib/prisma-money-extension.ts` converts Prisma `Decimal` → `number` transparently; never call `.toNumber()` yourself).
- Every new/changed user-facing string needs all three of `data/translations/{ru,lv,en}/common.ts` — never leave a language behind.

---

## Task 1: Schema — add ProductNewsSubscription, remove ProductSubscription/StockNotification

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/prisma-money-extension.ts`

**Interfaces:**
- Produces: Prisma model `ProductNewsSubscription { id, userId, productId, productTitle, notifyPrice, notifyStock, notifyPromo, createdAt }`, unique `userId_productId`, used by every later task.

- [ ] **Step 1: Remove `ProductSubscription` and `StockNotification` models**

In `prisma/schema.prisma`, delete the `model StockNotification { ... }` block (currently lines 489-503) and the `model ProductSubscription { ... }` block (currently lines 505-526) in full, including their blank line separators collapsing to one blank line between `model Review` (or whatever precedes `StockNotification`) and `model ReturnRequest`.

- [ ] **Step 2: Add `ProductNewsSubscription` in their place**

```prisma
model ProductNewsSubscription {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId    String
  productTitle String
  notifyPrice  Boolean  @default(true)
  notifyStock  Boolean  @default(true)
  notifyPromo  Boolean  @default(true)
  createdAt    DateTime @default(now())

  @@unique([userId, productId])
  @@index([productId])
  @@index([userId])
}
```

- [ ] **Step 3: Add the reverse relation on `User`**

In the `model User { ... }` block, add a line next to the other reverse-relation arrays (near `userNotifications   UserNotification[]`):

```prisma
  productNewsSubscriptions ProductNewsSubscription[]
```

- [ ] **Step 4: Drop the dead `ProductSubscription` money-field entry**

In `lib/prisma-money-extension.ts`, remove this line from `MONEY_FIELDS_BY_MODEL` (the model it references no longer exists):

```ts
  ProductSubscription: ['pricePerUnit'],
```

- [ ] **Step 5: Regenerate the Prisma client (codegen only, no DB access)**

Run: `npx prisma generate`
Expected: succeeds, prints the generated client path. This only reads `schema.prisma` — it does not touch the live database, so it's safe to run now even though the live Neon schema won't match until Task 17.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma lib/prisma-money-extension.ts
git commit -m "feat: replace ProductSubscription/StockNotification schema with ProductNewsSubscription"
```

---

## Task 2: `lib/product-news-notify.ts` — server-side notification fan-out

**Files:**
- Create: `lib/product-news-notify.ts`
- Test: `lib/product-news-notify.test.ts`

**Interfaces:**
- Consumes: `prisma` and `ExtendedTransactionClient` from `@/lib/prisma`.
- Produces: `notifyPriceChange(productId, productTitle, oldPrice, newPrice, db?)`, `notifyRestock(productId, productTitle, db?)`, `notifyPromo(productId, productTitle, message, db?)` — all `Promise<void>`, all used by Task 5 and Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMock = vi.hoisted(() => vi.fn())
const createManyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productNewsSubscription: { findMany: findManyMock },
    userNotification: { createMany: createManyMock },
  },
}))

import { notifyPriceChange, notifyRestock, notifyPromo } from './product-news-notify'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyPriceChange', () => {
  it('notifies only price-flag subscribers with old/new price in the message', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])

    await notifyPriceChange('p1', 'Shampoo', 10, 8)

    expect(findManyMock).toHaveBeenCalledWith({
      where: { productId: 'p1', notifyPrice: true },
      select: { userId: true },
    })
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'u1', type: 'info', channel: 'app', link: '/product/p1' }),
        expect.objectContaining({ userId: 'u2', type: 'info', channel: 'app', link: '/product/p1' }),
      ],
    })
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0].message).toContain('8.00')
    expect(data[0].message).toContain('10.00')
  })

  it('does nothing when there are no subscribers', async () => {
    findManyMock.mockResolvedValue([])
    await notifyPriceChange('p1', 'Shampoo', 10, 8)
    expect(createManyMock).not.toHaveBeenCalled()
  })
})

describe('notifyRestock', () => {
  it('notifies stock-flag subscribers with a success-type message', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyRestock('p1', 'Shampoo')
    expect(findManyMock).toHaveBeenCalledWith({
      where: { productId: 'p1', notifyStock: true },
      select: { userId: true },
    })
    expect(createManyMock).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'u1', type: 'success', channel: 'app' })],
    })
  })
})

describe('notifyPromo', () => {
  it('uses the given message when provided', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyPromo('p1', 'Shampoo', 'Скидка 20% сегодня')
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0]).toMatchObject({ userId: 'u1', type: 'promo', message: 'Скидка 20% сегодня' })
  })

  it('falls back to a generic message when none is given', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyPromo('p1', 'Shampoo', undefined)
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0].message).toContain('Shampoo')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-news-notify.test.ts`
Expected: FAIL — `Cannot find module './product-news-notify'`

- [ ] **Step 3: Write the implementation**

```ts
import 'server-only'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'

type NotifyDb = Pick<ExtendedTransactionClient, 'productNewsSubscription' | 'userNotification'>

export async function notifyPriceChange(
  productId: string,
  productTitle: string,
  oldPrice: number,
  newPrice: number,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyPrice: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  const direction = newPrice < oldPrice ? 'снизилась' : 'изменилась'
  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'info',
      title: 'Изменилась цена',
      message: `Цена на «${productTitle}» ${direction}: €${oldPrice.toFixed(2)} → €${newPrice.toFixed(2)}.`,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}

export async function notifyRestock(
  productId: string,
  productTitle: string,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyStock: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'success',
      title: 'Товар снова в наличии',
      message: `«${productTitle}» появился на складе.`,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}

export async function notifyPromo(
  productId: string,
  productTitle: string,
  message: string | undefined,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyPromo: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  const text = message?.trim() || `Специальное предложение на «${productTitle}».`
  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'promo',
      title: 'Акция на товар',
      message: text,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-news-notify.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-news-notify.ts lib/product-news-notify.test.ts
git commit -m "feat: add server-side product-news notification fan-out"
```

---

## Task 3: `app/api/product-news/route.ts` — list + subscribe

**Files:**
- Create: `app/api/product-news/route.ts`
- Test: `app/api/product-news/route.test.ts`

**Interfaces:**
- Consumes: `getServerUser` from `@/lib/server-auth`, `prisma` from `@/lib/prisma`.
- Produces: `GET` → `{ subscriptions: Array<{ id, userId, productId, productTitle, notifyPrice, notifyStock, notifyPromo, createdAt: string }> }`; `POST` body `{ productId, notifyPrice?, notifyStock?, notifyPromo? }` → `{ subscriptionId }` (201), used by Task 7's client store.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const upsertMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: vi.fn() },
    productNewsSubscription: { findMany: vi.fn(), upsert: upsertMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET, POST } from './route'

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/product-news', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 'p1', ...overrides }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'u@example.com' } as never)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({
    id: 'p1', title: 'Shampoo', isActive: true, isDeleted: false,
  } as never)
  upsertMock.mockResolvedValue({ id: 'sub-1' })
})

describe('GET /api/product-news', () => {
  it('rejects anonymous callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/product-news', () => {
  it('upserts by userId+productId with the default flags all true', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_productId: { userId: 'u1', productId: 'p1' } },
      create: expect.objectContaining({ notifyPrice: true, notifyStock: true, notifyPromo: true }),
      update: { notifyPrice: true, notifyStock: true, notifyPromo: true },
    }))
  })

  it('rejects a request with every flag turned off', async () => {
    const res = await POST(makeRequest({ notifyPrice: false, notifyStock: false, notifyPromo: false }))
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('404s for a product that does not exist or is inactive', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/product-news/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const subscriptions = await prisma.productNewsSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    })
  } catch (e) {
    logApiError('[product-news GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      productId?: string
      notifyPrice?: boolean
      notifyStock?: boolean
      notifyPromo?: boolean
    }
    if (!body.productId) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

    const notifyPrice = body.notifyPrice ?? true
    const notifyStock = body.notifyStock ?? true
    const notifyPromo = body.notifyPromo ?? true
    if (!notifyPrice && !notifyStock && !notifyPromo) {
      return NextResponse.json({ error: 'select_at_least_one' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, title: true, isActive: true, isDeleted: true },
    })
    if (!product || !product.isActive || product.isDeleted) {
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
    }

    const sub = await prisma.productNewsSubscription.upsert({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      create: {
        id: randomUUID(),
        userId: user.id,
        productId: product.id,
        productTitle: product.title,
        notifyPrice,
        notifyStock,
        notifyPromo,
      },
      update: { notifyPrice, notifyStock, notifyPromo },
    })

    return NextResponse.json({ subscriptionId: sub.id }, { status: 201 })
  } catch (e) {
    logApiError('[product-news POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/product-news/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/product-news/route.ts app/api/product-news/route.test.ts
git commit -m "feat: add GET/POST /api/product-news"
```

---

## Task 4: `app/api/product-news/[id]/route.ts` — update flags + unsubscribe

**Files:**
- Create: `app/api/product-news/[id]/route.ts`
- Test: `app/api/product-news/[id]/route.test.ts`

**Interfaces:**
- Produces: `PATCH` body `{ notifyPrice?, notifyStock?, notifyPromo? }` → `{ ok: true }`; `DELETE` → `{ ok: true }`. Both 403 on IDOR (subscription owned by a different user). Used by Task 7's client store.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productNewsSubscription: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { PATCH, DELETE } from './route'

const context = { params: Promise.resolve({ id: 'sub-b' }) }
const patch = (body: unknown) => PATCH(new NextRequest('https://shop.test/api/product-news/sub-b', {
  method: 'PATCH', body: JSON.stringify(body),
}), context)
const del = () => DELETE(new NextRequest('https://shop.test/api/product-news/sub-b', { method: 'DELETE' }), context)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', email: 'a@example.com' } as never)
})

describe('PATCH /api/product-news/:id', () => {
  it('rejects an IDOR update', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-b', notifyPrice: true, notifyStock: true, notifyPromo: true,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(403)
    expect(prisma.productNewsSubscription.update).not.toHaveBeenCalled()
  })

  it('rejects turning every flag off', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-a', notifyPrice: true, notifyStock: false, notifyPromo: false,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(400)
    expect(prisma.productNewsSubscription.update).not.toHaveBeenCalled()
  })

  it('updates the owner’s own subscription', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-a', notifyPrice: true, notifyStock: true, notifyPromo: true,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(200)
    expect(prisma.productNewsSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-b' }, data: { notifyPrice: false },
    })
  })
})

describe('DELETE /api/product-news/:id', () => {
  it('rejects an IDOR delete', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({ id: 'sub-b', userId: 'user-b' } as never)
    const res = await del()
    expect(res.status).toBe(403)
    expect(prisma.productNewsSubscription.delete).not.toHaveBeenCalled()
  })

  it('deletes the owner’s own subscription', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({ id: 'sub-b', userId: 'user-a' } as never)
    const res = await del()
    expect(res.status).toBe(200)
    expect(prisma.productNewsSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-b' } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/product-news/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.productNewsSubscription.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (sub.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = (await req.json()) as {
      notifyPrice?: boolean
      notifyStock?: boolean
      notifyPromo?: boolean
    }
    const data: { notifyPrice?: boolean; notifyStock?: boolean; notifyPromo?: boolean } = {}
    if (typeof body.notifyPrice === 'boolean') data.notifyPrice = body.notifyPrice
    if (typeof body.notifyStock === 'boolean') data.notifyStock = body.notifyStock
    if (typeof body.notifyPromo === 'boolean') data.notifyPromo = body.notifyPromo

    const nextPrice = data.notifyPrice ?? sub.notifyPrice
    const nextStock = data.notifyStock ?? sub.notifyStock
    const nextPromo = data.notifyPromo ?? sub.notifyPromo
    if (!nextPrice && !nextStock && !nextPromo) {
      return NextResponse.json({ error: 'select_at_least_one' }, { status: 400 })
    }

    await prisma.productNewsSubscription.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[product-news/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.productNewsSubscription.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (sub.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    await prisma.productNewsSubscription.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[product-news/:id DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/product-news/[id]/route.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/product-news/[id]/route.ts" "app/api/product-news/[id]/route.test.ts"
git commit -m "feat: add PATCH/DELETE /api/product-news/:id"
```

---

## Task 5: Admin manual promo-notify route

**Files:**
- Create: `app/api/admin/products/[id]/notify-promo/route.ts`
- Test: `app/api/admin/products/[id]/notify-promo/route.test.ts`

**Interfaces:**
- Consumes: `notifyPromo` from `@/lib/product-news-notify` (Task 2), `requireAdminPermission` from `@/lib/server-auth`.
- Produces: `POST` body `{ message?: string }` → `{ ok: true }`, used by Task 10's admin button.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { product: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/product-news-notify', () => ({ notifyPromo: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { notifyPromo } from '@/lib/product-news-notify'
import { POST } from './route'

const context = { params: Promise.resolve({ id: 'p1' }) }
const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/admin/products/p1/notify-promo', {
  method: 'POST', body: JSON.stringify(body),
}), context)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', title: 'Shampoo', isDeleted: false } as never)
})

describe('POST /api/admin/products/:id/notify-promo', () => {
  it('rejects a caller without catalog.update permission', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await post({})
    expect(res.status).toBe(403)
    expect(notifyPromo).not.toHaveBeenCalled()
  })

  it('404s for a missing or deleted product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(404)
  })

  it('forwards the trimmed message to notifyPromo', async () => {
    const res = await post({ message: '  Скидка 20%  ' })
    expect(res.status).toBe(200)
    expect(notifyPromo).toHaveBeenCalledWith('p1', 'Shampoo', '  Скидка 20%  '.slice(0, 500))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/admin/products/[id]/notify-promo/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { notifyPromo } from '@/lib/product-news-notify'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, title: true, isDeleted: true },
    })
    if (!product || product.isDeleted) return NextResponse.json({ error: 'product_not_found' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { message?: string }
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : undefined

    await notifyPromo(id, product.title, message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[admin/products/:id/notify-promo POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/admin/products/[id]/notify-promo/route.test.ts"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/products/[id]/notify-promo" 
git commit -m "feat: add admin promo-notify route"
```

---

## Task 6: Wire price/restock triggers into the admin product PUT route

**Files:**
- Modify: `app/api/admin/products/route.ts`
- Create: `app/api/admin/products/route.test.ts`

**Interfaces:**
- Consumes: `notifyPriceChange`, `notifyRestock` from `@/lib/product-news-notify` (Task 2).

This is the one route both the full admin product-edit form (Task 10 wires a button next to it) and the admin catalog quick-stock-edit card (`components/admin/products/ProductCard.tsx`, cleaned up in Task 12) already PUT through — so hooking it here covers both UIs with one change.

- [ ] **Step 1: Write the failing tests**

These tests exercise only the notify-trigger wiring, not the route's pre-existing (untested) business rules — mock every collaborator at the boundary.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const txProductFindUnique = vi.hoisted(() => vi.fn())
const txProductUpdateMany = vi.hoisted(() => vi.fn())
const txProductFindUniqueOrThrow = vi.hoisted(() => vi.fn())
const txKeyValueFindUnique = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
const notifyPriceChangeMock = vi.hoisted(() => vi.fn())
const notifyRestockMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({
      product: {
        findUnique: txProductFindUnique,
        updateMany: txProductUpdateMany,
        findUniqueOrThrow: txProductFindUniqueOrThrow,
      },
      keyValueSetting: { findUnique: txKeyValueFindUnique },
    }),
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({
  applyProductOverride: (base: unknown) => base,
  getAdminProducts: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/product-overrides-mapping', () => ({
  mapDbToProduct: (p: { id: string; title: string; price: number; stock: number }) => p,
  mapProductToDbCreate: (p: { id: string; title: string; price: number; stock: number }) => ({
    id: p.id, isCustom: true, isDeleted: false, title: p.title, price: p.price, stock: p.stock,
  }),
}))
vi.mock('@/lib/product-news-notify', () => ({
  notifyPriceChange: notifyPriceChangeMock,
  notifyRestock: notifyRestockMock,
}))

import { requireAdminPermission } from '@/lib/server-auth'
import { PUT } from './route'

function putRequest(changes: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/products', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p1', revision: 1, changes }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
  txKeyValueFindUnique.mockResolvedValue(null)
  txProductUpdateMany.mockResolvedValue({ count: 1 })
})

it('fires notifyPriceChange when price actually changes', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 8, stock: 5 })

  const res = await PUT(putRequest({ price: 8 }))

  expect(res.status).toBe(200)
  expect(notifyPriceChangeMock).toHaveBeenCalledWith('p1', 'Shampoo', 10, 8)
  expect(notifyRestockMock).not.toHaveBeenCalled()
})

it('fires notifyRestock when stock goes from 0 to positive', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 0, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 20 })

  const res = await PUT(putRequest({ stock: 20 }))

  expect(res.status).toBe(200)
  expect(notifyRestockMock).toHaveBeenCalledWith('p1', 'Shampoo')
  expect(notifyPriceChangeMock).not.toHaveBeenCalled()
})

it('fires neither when price and stock are unchanged', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5 })

  const res = await PUT(putRequest({ title: 'Shampoo Deluxe' }))

  expect(res.status).toBe(200)
  expect(notifyPriceChangeMock).not.toHaveBeenCalled()
  expect(notifyRestockMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/products/route.test.ts`
Expected: FAIL — the route doesn't call `notifyPriceChange`/`notifyRestock` yet, so the first two tests fail their `toHaveBeenCalledWith` assertions.

- [ ] **Step 3: Wire the triggers into the PUT handler**

In `app/api/admin/products/route.ts`, add the import:

```ts
import { notifyPriceChange, notifyRestock } from '@/lib/product-news-notify'
```

Change the `PUT` handler body from:

```ts
    const { id, revision, changes } = parsed.data
    const updated = await prisma.$transaction(async (tx) => {
```

to:

```ts
    const { id, revision, changes } = parsed.data
    let priceChange: { oldPrice: number; newPrice: number } | null = null
    let restocked = false
    const updated = await prisma.$transaction(async (tx) => {
```

and, right before the transaction's `return next`, insert the diff check (after the existing `appendServerAudit` call):

```ts
      await appendServerAudit(tx, req, actor, { action: 'product.update', entityType: 'product', entityId: id, entityTitle: next.title, before, after: mapDbToProduct(next) })
      if (before.price !== next.price) priceChange = { oldPrice: before.price, newPrice: next.price }
      if (before.stock === 0 && next.stock > 0) restocked = true
      return next
```

and change the line after the transaction from:

```ts
    return successResponse({ product: mapDbToProduct(updated), products: await getAdminProducts() })
```

to:

```ts
    if (priceChange) {
      notifyPriceChange(id, updated.title, priceChange.oldPrice, priceChange.newPrice)
        .catch((e) => logApiError('[admin/products PUT notifyPriceChange]', e))
    }
    if (restocked) {
      notifyRestock(id, updated.title).catch((e) => logApiError('[admin/products PUT notifyRestock]', e))
    }
    return successResponse({ product: mapDbToProduct(updated), products: await getAdminProducts() })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/products/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/products/route.ts app/api/admin/products/route.test.ts
git commit -m "feat: trigger product-news notifications on price/stock change"
```

---

## Task 7: `lib/product-news-store.ts` — client zustand store

**Files:**
- Create: `lib/product-news-store.ts`

**Interfaces:**
- Consumes: `/api/product-news` and `/api/product-news/:id` (Tasks 3-4).
- Produces: `useProductNewsStore` with `subscriptions`, `subscribe`, `update`, `unsubscribe`, `getForProduct`, `hydrateFromServer` — used by Task 8 (widget) and Task 9 (account section).

- [ ] **Step 1: Write the implementation**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProductNewsSubscription {
  id: string
  productId: string
  productTitle: string
  notifyPrice: boolean
  notifyStock: boolean
  notifyPromo: boolean
  createdAt: string
}

interface ProductNewsStore {
  subscriptions: ProductNewsSubscription[]
  subscribe: (params: {
    productId: string
    productTitle: string
    notifyPrice: boolean
    notifyStock: boolean
    notifyPromo: boolean
  }) => Promise<ProductNewsSubscription | null>
  update: (id: string, flags: { notifyPrice: boolean; notifyStock: boolean; notifyPromo: boolean }) => void
  unsubscribe: (id: string) => void
  getForProduct: (productId: string) => ProductNewsSubscription | undefined
  hydrateFromServer: () => Promise<void>
}

export const useProductNewsStore = create<ProductNewsStore>()(
  persist(
    (set, get) => ({
      subscriptions: [],

      subscribe: async (params) => {
        const response = await fetch('/api/product-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })
        if (!response.ok) return null
        const payload = await response.json() as { subscriptionId?: string }
        if (!payload.subscriptionId) return null

        const existing = get().getForProduct(params.productId)
        const sub: ProductNewsSubscription = {
          id: payload.subscriptionId,
          productId: params.productId,
          productTitle: params.productTitle,
          notifyPrice: params.notifyPrice,
          notifyStock: params.notifyStock,
          notifyPromo: params.notifyPromo,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        }
        set((state) => ({
          subscriptions: [sub, ...state.subscriptions.filter((s) => s.productId !== params.productId)],
        }))
        return sub
      },

      update: (id, flags) => {
        set((state) => ({
          subscriptions: state.subscriptions.map((s) => (s.id === id ? { ...s, ...flags } : s)),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/product-news/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flags),
          }).catch(() => {})
        }
      },

      unsubscribe: (id) => {
        set((state) => ({ subscriptions: state.subscriptions.filter((s) => s.id !== id) }))
        if (typeof window !== 'undefined') {
          fetch(`/api/product-news/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
        }
      },

      getForProduct: (productId) => get().subscriptions.find((s) => s.productId === productId),

      hydrateFromServer: async () => {
        if (typeof window === 'undefined') return
        try {
          const response = await fetch('/api/product-news')
          if (!response.ok) return
          const payload = await response.json() as { subscriptions?: ProductNewsSubscription[] }
          if (!Array.isArray(payload.subscriptions)) return
          set({ subscriptions: payload.subscriptions })
        } catch {
          // Keep the persisted snapshot when the network is temporarily unavailable.
        }
      },
    }),
    { name: 'eshop-product-news' }
  )
)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors attributable to this file (pre-existing errors from not-yet-updated consumers of the old stores are expected at this point in the plan and will clear by Task 14/15).

- [ ] **Step 3: Commit**

```bash
git add lib/product-news-store.ts
git commit -m "feat: add client-side product-news store"
```

---

## Task 8: `components/ProductNewsWidget.tsx` — product page widget

**Files:**
- Create: `components/ProductNewsWidget.tsx`
- Modify: `components/ProductActions.tsx`
- Delete: `components/SubscriptionWidget.tsx`

**Interfaces:**
- Consumes: `useProductNewsStore` (Task 7), translation keys `productNews.*` (added in Task 11 — component references them now, translations land in Task 11; both must land before the branch is releasable, order between them doesn't matter for compilation since `t()` takes a plain string).
- Produces: `<ProductNewsWidget product={product} />`, replacing `<SubscriptionWidget product={product} displayPrice={displayPrice} />` in `ProductActions.tsx`. Unlike the old widget, it renders even when `product.stock === 0` (that's exactly when the restock checkbox matters).

- [ ] **Step 1: Create the widget**

```tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProductNewsStore } from '@/lib/product-news-store'
import { getCurrentUser } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'
import { Product } from '@/data/products'

interface ProductNewsWidgetProps {
  product: Product
}

export const ProductNewsWidget: React.FC<ProductNewsWidgetProps> = ({ product }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { subscribe, update, unsubscribe, getForProduct } = useProductNewsStore()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isHydrated = useAuthStore((s) => s.isHydrated)

  const [open, setOpen] = useState(false)
  const [notifyPrice, setNotifyPrice] = useState(true)
  const [notifyStock, setNotifyStock] = useState(true)
  const [notifyPromo, setNotifyPromo] = useState(true)
  const [existingSub, setExistingSub] = useState<ReturnType<typeof getForProduct>>(undefined)
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('subscribe') !== '1') return
    if (!isHydrated || !isAuthenticated) return
    queueMicrotask(() => {
      setOpen(true)
      widgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [isHydrated, isAuthenticated])

  useEffect(() => {
    const user = getCurrentUser()
    if (!user) return
    queueMicrotask(() => setExistingSub(getForProduct(product.id)))
  }, [product.id, getForProduct])

  const openDialog = (): void => {
    if (existingSub) {
      setNotifyPrice(existingSub.notifyPrice)
      setNotifyStock(existingSub.notifyStock)
      setNotifyPromo(existingSub.notifyPromo)
    } else {
      setNotifyPrice(true)
      setNotifyStock(true)
      setNotifyPromo(true)
    }
    setOpen(true)
  }

  const handleConfirm = async (): Promise<void> => {
    if (!notifyPrice && !notifyStock && !notifyPromo) {
      showToast(t('productNews.selectAtLeastOne'), 'error')
      return
    }
    if (existingSub) {
      update(existingSub.id, { notifyPrice, notifyStock, notifyPromo })
      setExistingSub({ ...existingSub, notifyPrice, notifyStock, notifyPromo })
      setOpen(false)
      showToast(t('productNews.updatedToast'), 'success')
      return
    }
    const user = getCurrentUser()
    if (!user) {
      showToast(t('productNews.loginRequired'), 'error')
      return
    }
    const sub = await subscribe({
      productId: product.id,
      productTitle: product.title,
      notifyPrice,
      notifyStock,
      notifyPromo,
    })
    if (!sub) {
      showToast(t('productNews.selectAtLeastOne'), 'error')
      return
    }
    setExistingSub(sub)
    setOpen(false)
    showToast(t('productNews.successToast'), 'success')
  }

  const handleUnsubscribe = (): void => {
    if (!existingSub) return
    unsubscribe(existingSub.id)
    setExistingSub(undefined)
    showToast(t('productNews.unsubscribedToast'), 'info')
  }

  const activeTypesLabel = useMemo(() => {
    if (!existingSub) return ''
    const parts: string[] = []
    if (existingSub.notifyPrice) parts.push(t('productNews.typePrice'))
    if (existingSub.notifyStock) parts.push(t('productNews.typeStock'))
    if (existingSub.notifyPromo) parts.push(t('productNews.typePromo'))
    return parts.join(', ')
  }, [existingSub, t])

  if (!isHydrated || !isAuthenticated) return null

  return (
    <>
      <div ref={widgetRef} id="product-subscription" className="product-news-widget mt-4 scroll-mt-24">
        {existingSub ? (
          <div className="product-news-widget__active flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/20 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary dark:text-primary/60">
                  {t('productNews.activeLabel')}
                </p>
                <p className="text-xs text-muted-foreground truncate">{activeTypesLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={openDialog} className="text-xs text-primary hover:underline">
                {t('productNews.editBtn')}
              </button>
              <button onClick={handleUnsubscribe} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                {t('productNews.unsubscribeBtn')}
              </button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="product-news-widget__trigger w-full gap-2 border-primary/50 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary dark:hover:bg-primary/20"
            onClick={openDialog}
          >
            <Bell className="w-4 h-4" />
            {t('productNews.notifyBtn')}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="product-news-widget__dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('productNews.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('productNews.dialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="product-news-widget__options space-y-3 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyPrice} onCheckedChange={(v) => setNotifyPrice(v === true)} />
              {t('productNews.typePrice')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyStock} onCheckedChange={(v) => setNotifyStock(v === true)} />
              {t('productNews.typeStock')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyPromo} onCheckedChange={(v) => setNotifyPromo(v === true)} />
              {t('productNews.typePromo')}
            </label>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => void handleConfirm()}>
                {existingSub ? t('productNews.saveBtn') : t('productNews.subscribeBtn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Wire it into `ProductActions.tsx`**

In `components/ProductActions.tsx`, change:

```tsx
import { SubscriptionWidget } from '@/components/SubscriptionWidget';
```

to:

```tsx
import { ProductNewsWidget } from '@/components/ProductNewsWidget';
```

and change:

```tsx
            <SubscriptionWidget product={product} displayPrice={displayPrice} />
```

to:

```tsx
            <ProductNewsWidget product={product} />
```

- [ ] **Step 3: Delete the old widget**

```bash
git rm components/SubscriptionWidget.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `ProductActions.tsx` or `ProductNewsWidget.tsx`. (Other files still importing `subscription-store`/`stock-notify-store` remain broken until later tasks — expected.)

- [ ] **Step 5: Commit**

```bash
git add components/ProductNewsWidget.tsx components/ProductActions.tsx
git commit -m "feat: replace discount subscription widget with product-news widget"
```

---

## Task 9: Account section — `AccountProductNewsSection.tsx`

**Files:**
- Create: `components/account/AccountProductNewsSection.tsx`
- Modify: `app/[lang]/account/page.tsx`
- Delete: `components/account/AccountSubscriptionsSection.tsx`
- Delete: `components/account/AccountStockNotificationsSection.tsx`
- Delete: `hooks/useSubscriptionReminders.ts`

**Interfaces:**
- Consumes: `useProductNewsStore` (Task 7).
- Produces: `<AccountProductNewsSection />`, replacing both `<AccountSubscriptionsSection />` and `<AccountStockNotificationsSection />` in the account page (one unified list instead of two separate ones — restock is now just a flag on the same subscription, not a separate section).

- [ ] **Step 1: Create the account section**

```tsx
'use client';

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Bell, ShoppingBag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useProductNewsStore, ProductNewsSubscription } from '@/lib/product-news-store';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

function ProductNewsCard({
    sub,
    onUpdate,
    onUnsubscribe,
    t,
}: {
    sub: ProductNewsSubscription;
    onUpdate: (flags: { notifyPrice: boolean; notifyStock: boolean; notifyPromo: boolean }) => void;
    onUnsubscribe: () => void;
    t: (key: string) => string;
}) {
    const toggle = (key: 'notifyPrice' | 'notifyStock' | 'notifyPromo') => {
        const next = {
            notifyPrice: sub.notifyPrice,
            notifyStock: sub.notifyStock,
            notifyPromo: sub.notifyPromo,
            [key]: !sub[key],
        };
        if (!next.notifyPrice && !next.notifyStock && !next.notifyPromo) return;
        onUpdate(next);
    };

    return (
        <div className="account-product-news__card rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <Link href={`/product/${sub.productId}`} className="text-sm font-medium text-foreground hover:text-primary leading-snug">
                    {sub.productTitle}
                </Link>
                <button
                    onClick={onUnsubscribe}
                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                    title={t('productNews.unsubscribeBtn')}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyPrice} onCheckedChange={() => toggle('notifyPrice')} />
                    {t('productNews.typePrice')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyStock} onCheckedChange={() => toggle('notifyStock')} />
                    {t('productNews.typeStock')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyPromo} onCheckedChange={() => toggle('notifyPromo')} />
                    {t('productNews.typePromo')}
                </label>
            </div>
        </div>
    );
}

export const AccountProductNewsSection: React.FC = () => {
    const { t } = useTranslation();
    const subscriptions = useProductNewsStore((state) => state.subscriptions);
    const { update, unsubscribe, hydrateFromServer } = useProductNewsStore();
    const userId = useAuthStore((state) => state.user?.id ?? null);

    useEffect(() => {
        if (userId) void hydrateFromServer();
    }, [userId, hydrateFromServer]);

    const subs = useMemo(() => subscriptions, [subscriptions]);

    return (
        <section className="account-product-news rounded-xl border border-border bg-card p-5">
            <div className="account-product-news__header flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                    {t('productNews.sectionTitle')}
                </h2>
                {subs.length > 0 && (
                    <Badge className="ml-1 text-xs bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary border-0">
                        {subs.length}
                    </Badge>
                )}
            </div>

            {subs.length === 0 ? (
                <div className="account-product-news__empty flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/5 dark:bg-primary/20 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-primary/80" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('productNews.emptyTitle')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {t('productNews.emptyHint')}
                        </p>
                    </div>
                    <Link href="/catalog">
                        <button className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            {t('productNews.emptyCta')}
                        </button>
                    </Link>
                </div>
            ) : (
                <div className="account-product-news__list space-y-3">
                    {subs.map((sub) => (
                        <ProductNewsCard
                            key={sub.id}
                            sub={sub}
                            t={t}
                            onUpdate={(flags) => update(sub.id, flags)}
                            onUnsubscribe={() => unsubscribe(sub.id)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
```

- [ ] **Step 2: Wire it into the account page, remove the two old sections and the reminders hook**

In `app/[lang]/account/page.tsx`:

Replace the import block lines

```tsx
import { AccountSubscriptionsSection } from '@/components/account/AccountSubscriptionsSection';
```

and (a few lines below)

```tsx
import { AccountStockNotificationsSection } from '@/components/account/AccountStockNotificationsSection';
```

and

```tsx
import { useSubscriptionReminders } from '@/hooks/useSubscriptionReminders';
```

with a single import:

```tsx
import { AccountProductNewsSection } from '@/components/account/AccountProductNewsSection';
```

Remove the line:

```tsx
    useSubscriptionReminders(user?.id ?? null);
```

Replace the render block:

```tsx
                        {!isAdmin && (
                            <div className="mt-4">
                                <AccountSubscriptionsSection />
                            </div>
                        )}
```

with:

```tsx
                        {!isAdmin && (
                            <div className="mt-4">
                                <AccountProductNewsSection />
                            </div>
                        )}
```

and remove the separate line:

```tsx
                        {!isAdmin && <AccountStockNotificationsSection />}
```

(no replacement — restock is now one of the three flags on the unified section above, not a second block).

- [ ] **Step 3: Delete the old files**

```bash
git rm components/account/AccountSubscriptionsSection.tsx components/account/AccountStockNotificationsSection.tsx hooks/useSubscriptionReminders.ts
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `account/page.tsx` or the new section. (`useCheckoutPage.tsx` and the `subscription-store`/`stock-notify-store` files themselves are still mid-migration — expected until Tasks 13-15.)

- [ ] **Step 5: Commit**

```bash
git add components/account/AccountProductNewsSection.tsx "app/[lang]/account/page.tsx"
git commit -m "feat: replace subscription/stock-notify account sections with unified product-news section"
```

---

## Task 10: Admin — manual promo-notify button on the product edit form

**Files:**
- Create: `components/admin/products/NotifyPromoSubscribersButton.tsx`
- Modify: `components/admin/products/AddProductForm.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/products/:id/notify-promo` (Task 5).

- [ ] **Step 1: Create the button**

```tsx
'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NotifyPromoSubscribersButtonProps {
    productId: string;
}

export const NotifyPromoSubscribersButton: React.FC<NotifyPromoSubscribersButtonProps> = ({ productId }) => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState('');

    const handleSend = async (): Promise<void> => {
        setSending(true);
        setResult('');
        try {
            const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/notify-promo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() || undefined }),
            });
            setResult(res.ok ? 'Отправлено' : 'Ошибка');
            if (res.ok) {
                setOpen(false);
                setMessage('');
            }
        } catch {
            setResult('Ошибка');
        } finally {
            setSending(false);
            setTimeout(() => setResult(''), 2500);
        }
    };

    if (!open) {
        return (
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(true)}>
                    <Bell className="w-4 h-4 mr-2" />
                    Уведомить подписчиков
                </Button>
                {result && <span className="text-xs text-muted-foreground">{result}</span>}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Текст акции (необязательно)"
                className="w-64"
            />
            <Button type="button" onClick={() => void handleSend()} disabled={sending}>
                {sending ? 'Отправка...' : 'Отправить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
            </Button>
        </div>
    );
};
```

- [ ] **Step 2: Wire it into the edit form's action row**

In `components/admin/products/AddProductForm.tsx`, add the import:

```tsx
import { NotifyPromoSubscribersButton } from './NotifyPromoSubscribersButton';
```

Change:

```tsx
                                {isEdit && productId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            window.open(`/product/${productId}`, '_blank')
                                        }
                                    >
                                        Открыть на сайте ↗
                                    </Button>
                                )}
```

to:

```tsx
                                {isEdit && productId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            window.open(`/product/${productId}`, '_blank')
                                        }
                                    >
                                        Открыть на сайте ↗
                                    </Button>
                                )}
                                {isEdit && productId && <NotifyPromoSubscribersButton productId={productId} />}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add components/admin/products/NotifyPromoSubscribersButton.tsx components/admin/products/AddProductForm.tsx
git commit -m "feat: add manual promo-notify button to admin product edit form"
```

---

## Task 11: Translations — remove `subscription.*`/`stockNotify.*`, add `productNews.*`

**Files:**
- Modify: `data/translations/ru/common.ts`
- Modify: `data/translations/lv/common.ts`
- Modify: `data/translations/en/common.ts`

**Interfaces:**
- Produces: all `productNews.*` keys consumed by Task 8, Task 9, and Task 12's CTAs.

- [ ] **Step 1: Remove every `'subscription.*'` and `'stockNotify.*'` line**

In each of the three files, delete every line whose key starts with `'subscription.'` or `'stockNotify.'`. In `ru/common.ts` that's lines 380-432 as currently laid out (interleaved: `stockNotify.button` at 380, `subscription.*` at 381-421, the rest of `stockNotify.*` at 422-432) — delete all of them, keep whatever precedes/follows intact. In `lv/common.ts` and `en/common.ts`, delete the `subscription.*` blocks at the line ranges shown earlier (lv: 286-326, en: 285-325) plus their own `stockNotify.*` lines (same keys exist in all three files — locate by key name, not by line number, since exact line numbers will have shifted after Task 1-10 edits touched nothing in these files but git blame/other unrelated commits may have).

- [ ] **Step 2: Insert the new `productNews.*` block in `ru/common.ts`** (in the same spot the deleted lines occupied)

```ts
  'productNews.notifyBtn': 'Уведомить о новостях',
  'productNews.dialogTitle': 'Подписка на новости товара',
  'productNews.dialogDesc': 'Выберите, о чём вам сообщить',
  'productNews.typePrice': 'Изменение цены',
  'productNews.typeStock': 'Товар снова в наличии',
  'productNews.typePromo': 'Акции и скидки',
  'productNews.loginRequired': 'Войдите в аккаунт, чтобы подписаться',
  'productNews.subscribeBtn': 'Подписаться',
  'productNews.saveBtn': 'Сохранить',
  'productNews.successToast': 'Подписка оформлена',
  'productNews.updatedToast': 'Настройки подписки обновлены',
  'productNews.unsubscribedToast': 'Вы отписались от новостей товара',
  'productNews.activeLabel': 'Вы подписаны на новости',
  'productNews.editBtn': 'Изменить',
  'productNews.unsubscribeBtn': 'Отписаться',
  'productNews.selectAtLeastOne': 'Выберите хотя бы один тип уведомлений',
  'productNews.sectionTitle': 'Новости о товарах',
  'productNews.emptyTitle': 'Подписок пока нет',
  'productNews.emptyHint': 'Подпишитесь на странице любого товара, чтобы узнавать об изменении цены, поступлении на склад и акциях.',
  'productNews.emptyCta': 'Перейти в каталог',
  'productNews.catalogCta': 'Узнавать о новостях товара',
  'productNews.cartCta': 'Подписаться на новости товара',
  'productNews.orderHistoryCta': 'Подписаться на новости',
```

- [ ] **Step 3: Insert the new `productNews.*` block in `lv/common.ts`**

```ts
  'productNews.notifyBtn': 'Saņemt jaunumus',
  'productNews.dialogTitle': 'Preces jaunumu abonēšana',
  'productNews.dialogDesc': 'Izvēlieties, par ko jūs informēt',
  'productNews.typePrice': 'Cenas izmaiņas',
  'productNews.typeStock': 'Prece atkal pieejama',
  'productNews.typePromo': 'Akcijas un atlaides',
  'productNews.loginRequired': 'Lūdzu, piesakieties, lai abonētu',
  'productNews.subscribeBtn': 'Abonēt',
  'productNews.saveBtn': 'Saglabāt',
  'productNews.successToast': 'Abonements izveidots',
  'productNews.updatedToast': 'Abonementa iestatījumi atjaunināti',
  'productNews.unsubscribedToast': 'Jūs atteicāties no preces jaunumiem',
  'productNews.activeLabel': 'Jūs saņemat jaunumus',
  'productNews.editBtn': 'Mainīt',
  'productNews.unsubscribeBtn': 'Atteikties',
  'productNews.selectAtLeastOne': 'Izvēlieties vismaz vienu paziņojumu veidu',
  'productNews.sectionTitle': 'Preču jaunumi',
  'productNews.emptyTitle': 'Vēl nav abonementu',
  'productNews.emptyHint': 'Abonējiet jebkurā preču lapā, lai uzzinātu par cenas izmaiņām, pieejamību un akcijām.',
  'productNews.emptyCta': 'Doties uz katalogu',
  'productNews.catalogCta': 'Uzzināt par preces jaunumiem',
  'productNews.cartCta': 'Abonēt preces jaunumus',
  'productNews.orderHistoryCta': 'Abonēt jaunumus',
```

- [ ] **Step 4: Insert the new `productNews.*` block in `en/common.ts`**

```ts
  'productNews.notifyBtn': 'Notify me',
  'productNews.dialogTitle': 'Subscribe to product news',
  'productNews.dialogDesc': 'Choose what you want to be notified about',
  'productNews.typePrice': 'Price changes',
  'productNews.typeStock': 'Back in stock',
  'productNews.typePromo': 'Promotions and discounts',
  'productNews.loginRequired': 'Please sign in to subscribe',
  'productNews.subscribeBtn': 'Subscribe',
  'productNews.saveBtn': 'Save',
  'productNews.successToast': 'Subscribed',
  'productNews.updatedToast': 'Subscription settings updated',
  'productNews.unsubscribedToast': 'You unsubscribed from product news',
  'productNews.activeLabel': 'You are subscribed',
  'productNews.editBtn': 'Edit',
  'productNews.unsubscribeBtn': 'Unsubscribe',
  'productNews.selectAtLeastOne': 'Choose at least one notification type',
  'productNews.sectionTitle': 'Product news',
  'productNews.emptyTitle': 'No subscriptions yet',
  'productNews.emptyHint': 'Subscribe on any product page to hear about price changes, restocks and promotions.',
  'productNews.emptyCta': 'Go to catalog',
  'productNews.catalogCta': 'Get product news',
  'productNews.cartCta': 'Subscribe to product news',
  'productNews.orderHistoryCta': 'Subscribe to news',
```

- [ ] **Step 5: Verify no stray references remain to the deleted keys**

Run: `grep -rn "'subscription\.\|'stockNotify\." data/translations/ && echo FOUND || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 6: Commit**

```bash
git add data/translations/ru/common.ts data/translations/lv/common.ts data/translations/en/common.ts
git commit -m "feat: replace subscription/stockNotify translations with productNews"
```

---

## Task 12: Repoint catalog/cart/order-history CTAs, clean up admin quick-edit card

**Files:**
- Modify: `components/ProductCard.tsx`
- Modify: `components/ProductListRow.tsx`
- Modify: `components/ProductStock.tsx`
- Modify: `app/[lang]/cart/page.tsx`
- Modify: `components/account/AccountOrderCard.tsx`
- Modify: `components/account/AccountOrdersSection.tsx`
- Modify: `components/admin/products/ProductCard.tsx`

This is the task that actually removes every render site of `StockNotifyButton` and the old `subscription.catalogCta`/`cartCta`/`orderHistoryCta` links, unifying them into one deep link to the product page's `ProductNewsWidget` (`?subscribe=1`). Guests browsing an out-of-stock catalog card lose the old anonymous-email notify option — that's the intended effect of requiring login for the new model, not an oversight.

- [ ] **Step 1: `components/ProductCard.tsx`**

Change the import block:

```tsx
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { StockNotifyButton } from './StockNotifyButton';
```

to:

```tsx
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
```

Change the icon import:

```tsx
import { RefreshCw } from 'lucide-react';
```

to:

```tsx
import { Bell } from 'lucide-react';
```

Change the actions block:

```tsx
                    {isOutOfStock ? (
                        <StockNotifyButton productId={product.id} productTitle={localizedTitle} compact />
                    ) : (
                        <>
                            <AddToCartButton product={product} />
                            {isAuthenticated && (
                                <Link
                                    href={localizePath(`/product/${product.id}?subscribe=1`, language)}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary\40 px-2 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    {t('subscription.catalogCta')}
                                </Link>
                            )}
                        </>
                    )}
```

to:

```tsx
                    {!isOutOfStock && <AddToCartButton product={product} />}
                    {isAuthenticated && (
                        <Link
                            href={localizePath(`/product/${product.id}?subscribe=1`, language)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                        >
                            <Bell className="h-3.5 w-3.5" />
                            {t('productNews.catalogCta')}
                        </Link>
                    )}
```

(note the fixed `border-primary/40` — the original had a stray backslash, `border-primary\40`, that never worked as a Tailwind class; fixing it as part of the same edit since it's the exact line being touched)

- [ ] **Step 2: `components/ProductListRow.tsx`**

Change:

```tsx
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { StockNotifyButton } from './StockNotifyButton';
import { localizePath } from '@/lib/i18n-routing';
import { RefreshCw } from 'lucide-react';
```

to:

```tsx
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { localizePath } from '@/lib/i18n-routing';
import { Bell } from 'lucide-react';
```

Change:

```tsx
          <div className="flex-1 min-w-0 sm:flex-none">
            {isOutOfStock ? (
              <StockNotifyButton productId={product.id} productTitle={localizedTitle} compact />
            ) : (
              <AddToCartButton product={product} />
            )}
          </div>
          <WishlistButton product={product} className="shrink-0" />
        </div>
        {!isOutOfStock && isAuthenticated && (
          <Link
            href={localizePath(`/product/${product.id}?subscribe=1`, language)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('subscription.catalogCta')}
          </Link>
        )}
```

to:

```tsx
          <div className="flex-1 min-w-0 sm:flex-none">
            {!isOutOfStock && <AddToCartButton product={product} />}
          </div>
          <WishlistButton product={product} className="shrink-0" />
        </div>
        {isAuthenticated && (
          <Link
            href={localizePath(`/product/${product.id}?subscribe=1`, language)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Bell className="h-3.5 w-3.5" />
            {t('productNews.catalogCta')}
          </Link>
        )}
```

- [ ] **Step 3: `components/ProductStock.tsx`**

Change:

```tsx
import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { StockNotifyButton } from '@/components/StockNotifyButton';

interface ProductStockProps {
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductStock: React.FC<ProductStockProps> = ({ stock, productId, productTitle }) => {
    const { t } = useTranslation();
    if (stock === 0) {
        return (
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <p className="text-red-600 font-medium">{t('product.outOfStock')}</p>
                <StockNotifyButton productId={productId} productTitle={productTitle} />
            </div>
        );
    }
```

to:

```tsx
import React from 'react';
import { useTranslation } from '@/lib/use-translation';

interface ProductStockProps {
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductStock: React.FC<ProductStockProps> = ({ stock }) => {
    const { t } = useTranslation();
    if (stock === 0) {
        return (
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <p className="text-red-600 font-medium">{t('product.outOfStock')}</p>
            </div>
        );
    }
```

(dropped the now-unused `productId`/`productTitle` params — the "notify me" affordance for an out-of-stock product now lives in `ProductNewsWidget` below it on the page, not duplicated here; the caller in `ProductPrices.tsx` still passes those props, which is harmless since they're simply no longer destructured — leave that call site as-is, no change needed there)

- [ ] **Step 4: `app/[lang]/cart/page.tsx`**

Find and change:

```tsx
                                            {currentUser && (
                                                <Link
                                                    href={`/product/${item.id}?subscribe=1`}
                                                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                                >
                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                    {t('subscription.cartCta')}
                                                </Link>
                                            )}
```

to:

```tsx
                                            {currentUser && (
                                                <Link
                                                    href={`/product/${item.id}?subscribe=1`}
                                                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                                >
                                                    <Bell className="h-3.5 w-3.5" />
                                                    {t('productNews.cartCta')}
                                                </Link>
                                            )}
```

Check this file's icon imports (`grep -n "lucide-react" "app/[lang]/cart/page.tsx"`) — if `RefreshCw` is imported only for this one usage, swap it for `Bell` in the import line; if `RefreshCw` is used elsewhere in the same file, leave the import line alone and just add `Bell` to it.

- [ ] **Step 5: `components/account/AccountOrderCard.tsx`**

Change:

```tsx
import { ArrowRight, BookmarkPlus, CalendarDays, Coins, Package, RefreshCw, RotateCcw, Truck } from 'lucide-react'
```

to:

```tsx
import { ArrowRight, Bell, BookmarkPlus, CalendarDays, Coins, Package, RotateCcw, Truck } from 'lucide-react'
```

(`RefreshCw` is still used for the "repeat order" button in this file — check with `grep -n "RefreshCw" components/account/AccountOrderCard.tsx` before removing it from the import; if it's used elsewhere in the file, keep it in the import list alongside `Bell`)

Change:

```tsx
              <Link
                href={`/product/${item.id}?subscribe=1`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" />{subscribeLabel}
              </Link>
```

to:

```tsx
              <Link
                href={`/product/${item.id}?subscribe=1`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Bell className="h-3 w-3" />{subscribeLabel}
              </Link>
```

- [ ] **Step 6: `components/account/AccountOrdersSection.tsx`**

Change:

```tsx
                            subscribeLabel={t('subscription.orderHistoryCta')}
```

to:

```tsx
                            subscribeLabel={t('productNews.orderHistoryCta')}
```

- [ ] **Step 7: `components/admin/products/ProductCard.tsx`**

Remove the now-redundant client-side notify call and subscriber badge — the server now notifies restock subscribers automatically from the PUT route itself (Task 6), regardless of which admin UI triggered the stock change.

Change:

```tsx
import { Bell, Pencil, Trash2 } from 'lucide-react';
import { useStockNotifyStore } from '@/lib/stock-notify-store';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
}

const BADGE_LABELS: Record<string, string> = {
    new: 'Новинка',
    sale: 'Скидка',
    bestseller: 'Хит',
};

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
    const { getByProduct, notifyProduct } = useStockNotifyStore();
    const subscribers = getByProduct(product.id);

    const [stock, setStock] = useState(product.stock);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const handleSaveStock = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, changes: { stock } }),
            });
            if (!res.ok) throw new Error('save failed');

            if (product.stock === 0 && stock > 0 && subscribers.length > 0) {
                notifyProduct(product.id, product.title);
                setSaveMsg(`Уведомлено ${subscribers.length}`);
            } else {
                setSaveMsg('Сохранено');
            }
        } catch {
            setSaveMsg('Ошибка');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(''), 2500);
        }
    };
```

to:

```tsx
import { Pencil, Trash2 } from 'lucide-react';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
}

const BADGE_LABELS: Record<string, string> = {
    new: 'Новинка',
    sale: 'Скидка',
    bestseller: 'Хит',
};

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
    const [stock, setStock] = useState(product.stock);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const handleSaveStock = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, changes: { stock } }),
            });
            if (!res.ok) throw new Error('save failed');
            setSaveMsg('Сохранено');
        } catch {
            setSaveMsg('Ошибка');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(''), 2500);
        }
    };
```

And remove the subscriber-count badge block:

```tsx
                {subscribers.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-primary dark:text-primary ml-auto">
                        <Bell className="w-3 h-3" />
                        {subscribers.length}
                    </span>
                )}
```

(delete this block entirely; the `{saveMsg && (...)}` span right after it stays)

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from any of the 7 files touched in this task. `useCheckoutPage.tsx`, `subscription-store.ts`, `stock-notify-store.ts` and their remaining direct consumers are still broken — expected until Tasks 13-15.

- [ ] **Step 9: Commit**

```bash
git add components/ProductCard.tsx components/ProductListRow.tsx components/ProductStock.tsx "app/[lang]/cart/page.tsx" components/account/AccountOrderCard.tsx components/account/AccountOrdersSection.tsx components/admin/products/ProductCard.tsx
git commit -m "feat: repoint catalog/cart/order-history CTAs to product-news widget"
```

---

## Task 13: Remove discount-subscription plumbing from checkout, orders, pricing

**Files:**
- Modify: `lib/server-pricing.ts`
- Modify: `lib/server-pricing.test.ts`
- Modify: `lib/orders-data-store.ts`
- Modify: `app/api/orders/route.ts`
- Modify: `app/[lang]/checkout/useCheckoutPage.tsx`
- Modify: `app/[lang]/checkout/page.tsx`

- [ ] **Step 1: `lib/server-pricing.ts` — drop `forcedDiscountPercent`**

Change:

```ts
  /** Authenticated user's real bonus balance; null/undefined for guests (no bonus allowed). */
  userBonusBalance?: number | null
  /** Server-validated discount (for example, an owned active product subscription). */
  forcedDiscountPercent?: number | null
}
```

to:

```ts
  /** Authenticated user's real bonus balance; null/undefined for guests (no bonus allowed). */
  userBonusBalance?: number | null
}
```

Change:

```ts
  const forcedDiscountPercent = Math.min(100, Math.max(0, Number(input.forcedDiscountPercent) || 0))
  const promoDiscountPct = forcedDiscountPercent > 0
    ? 0
    : await getServerPromoDiscountPct(input.promoCode, subtotal, db)
  const discountPct = forcedDiscountPercent || promoDiscountPct
  const discount = discountPct > 0 ? calculateDiscount(subtotal, discountPct) : 0
```

to:

```ts
  const promoDiscountPct = await getServerPromoDiscountPct(input.promoCode, subtotal, db)
  const discount = promoDiscountPct > 0 ? calculateDiscount(subtotal, promoDiscountPct) : 0
```

- [ ] **Step 2: `lib/server-pricing.test.ts` — remove the now-invalid test**

Delete this entire `it` block:

```ts
  it('applies a server-validated subscription discount without treating it as a promo code', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 0 },
    ])

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 2, price: 1 }],
      deliveryMethod: 'pickup',
      forcedDiscountPercent: 10,
    })

    expect(r.subtotal).toBe(200)
    expect(r.discount).toBe(20)
    expect(r.total).toBe(180)
    expect(r.promoApplied).toBe(false)
    expect(promoCodeFindFirstMock).not.toHaveBeenCalled()
  })

```

Run: `npx vitest run lib/server-pricing.test.ts`
Expected: PASS (remaining tests unaffected)

- [ ] **Step 3: `lib/orders-data-store.ts` — drop the `subscriptionId` field**

Change:

```ts
  userId?: string
  companyId?: string
  /** Checkout source. Persisted through the related subscription lifecycle, not on the order row. */
  subscriptionId?: string
}
```

to:

```ts
  userId?: string
  companyId?: string
}
```

- [ ] **Step 4: `app/api/orders/route.ts` — remove subscription validation and rollover**

Change:

```ts
    const caller = await getServerUser()
    const subscriptionId = typeof order.subscriptionId === 'string' ? order.subscriptionId : undefined
    if (subscriptionId && !caller) {
      return NextResponse.json({ error: 'subscription_auth_required' }, { status: 401 })
    }
    const ip = req.headers.get('cf-connecting-ip')?.trim()
```

to:

```ts
    const caller = await getServerUser()
    const ip = req.headers.get('cf-connecting-ip')?.trim()
```

Change:

```ts
    const created = await createServerOrder(orderBase, async (tx, currentBonusBalance) => {
      const subscription = subscriptionId
        ? await tx.productSubscription.findUnique({ where: { id: subscriptionId } })
        : null
      if (subscriptionId && (
        !subscription
        || subscription.userId !== caller?.id
        || subscription.status !== 'active'
        || items.length !== 1
        || items[0]?.id !== subscription.productId
        || items[0]?.quantity !== subscription.quantity
        || (subscription.lastOrderDate !== null
          && subscription.nextOrderDate > new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      )) {
        throw new InvalidSubscriptionCheckoutError()
      }
      const pricing = await recomputeOrderPricing({
        items: items.map((item) => ({ id: item.id, quantity: item.quantity, price: item.price })),
        promoCode: order.promoCode,
        deliveryMethod: order.deliveryMethod,
        bonusSpent: order.bonusSpent,
        userBonusBalance: currentBonusBalance,
        forcedDiscountPercent: subscription?.discountPercent,
      }, tx)
      if (subscription) {
        const nextOrderDate = new Date()
        nextOrderDate.setMonth(nextOrderDate.getMonth() + (subscription.interval === 'quarterly' ? 3 : 1))
        await tx.productSubscription.update({
          where: { id: subscription.id },
          data: { lastOrderDate: new Date(), nextOrderDate, remindedAt: null },
        })
      }
      return {
```

to:

```ts
    const created = await createServerOrder(orderBase, async (tx, currentBonusBalance) => {
      const pricing = await recomputeOrderPricing({
        items: items.map((item) => ({ id: item.id, quantity: item.quantity, price: item.price })),
        promoCode: order.promoCode,
        deliveryMethod: order.deliveryMethod,
        bonusSpent: order.bonusSpent,
        userBonusBalance: currentBonusBalance,
      }, tx)
      return {
```

Change:

```ts
    if (error instanceof PromoCodeUsageLimitError) {
      return NextResponse.json({ error: 'promo_code_usage_limit' }, { status: 409 })
    }
    if (error instanceof InvalidSubscriptionCheckoutError) {
      return NextResponse.json({ error: 'invalid_subscription_checkout' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}

class InvalidSubscriptionCheckoutError extends Error {}
```

to:

```ts
    if (error instanceof PromoCodeUsageLimitError) {
      return NextResponse.json({ error: 'promo_code_usage_limit' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}
```

- [ ] **Step 5: `app/[lang]/checkout/useCheckoutPage.tsx` — remove subscription wiring**

Remove the import:

```tsx
import { useSubscriptionStore } from '@/lib/subscription-store';
```

Change:

```tsx
    const searchParams = useSearchParams();
    const subscriptionId = searchParams.get('subscription') ?? undefined;
    const subscription = useSubscriptionStore((state) =>
        subscriptionId ? state.subscriptions.find((item) => item.id === subscriptionId) : undefined
    );
    const processNextOrder = useSubscriptionStore((state) => state.processNextOrder);
    const { items, removeItem, updateQuantity, replaceWithItems } = useCart();
```

to:

```tsx
    const searchParams = useSearchParams();
    const { items, removeItem, updateQuantity, replaceWithItems } = useCart();
```

Change (in `handleSubmit`):

```tsx
        // Calculate totals
        const discountPercent = subscription?.status === 'active'
            ? subscription.discountPercent
            : appliedPromo && appliedPromoDiscountPct !== null
                ? appliedPromoDiscountPct
                : null;
```

to:

```tsx
        // Calculate totals
        const discountPercent = appliedPromo && appliedPromoDiscountPct !== null
            ? appliedPromoDiscountPct
            : null;
```

Change:

```tsx
            language: language as string,
            ...formData,
            subscriptionId,
        };
```

to:

```tsx
            language: language as string,
            ...formData,
        };
```

Change:

```tsx
            orderId = String(payload.orderId);
            if (subscriptionId) processNextOrder(subscriptionId);
        } catch {
```

to:

```tsx
            orderId = String(payload.orderId);
        } catch {
```

Change (the pre-return recomputation mirroring the submit-time one):

```tsx
    const checkoutDiscountPercent = subscription?.status === 'active'
        ? subscription.discountPercent
        : appliedPromo && appliedPromoDiscountPct !== null
            ? appliedPromoDiscountPct
            : null;
```

to:

```tsx
    const checkoutDiscountPercent = appliedPromo && appliedPromoDiscountPct !== null
        ? appliedPromoDiscountPct
        : null;
```

Change (the returned state object):

```tsx
        appliedPromoDiscountPct,
        subscriptionId,
        subscriptionDiscountPercent: subscription?.discountPercent ?? null,
        setAppliedPromoDiscountPct,
```

to:

```tsx
        appliedPromoDiscountPct,
        setAppliedPromoDiscountPct,
```

- [ ] **Step 6: `app/[lang]/checkout/page.tsx` — remove the notice banner and the promo-box guard**

Change:

```tsx
            appliedPromoDiscountPct,
            setAppliedPromoDiscountPct,
            subscriptionId,
            subscriptionDiscountPercent,
            bonusApplied,
```

to:

```tsx
            appliedPromoDiscountPct,
            setAppliedPromoDiscountPct,
            bonusApplied,
```

Change:

```tsx
            {subscriptionId && subscriptionDiscountPercent !== null && (
                <div className="mx-auto mb-6 max-w-5xl rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
                    {t('subscription.checkoutNotice').replace('{discount}', String(subscriptionDiscountPercent))}
                </div>
            )}

            <div className="checkout__layout grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
```

to:

```tsx
            <div className="checkout__layout grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
```

Change:

```tsx
                        {/* Promo code */}
                        {!subscriptionId && <div className="h-full rounded-md border border-border p-3">
```

to:

```tsx
                        {/* Promo code */}
                        <div className="h-full rounded-md border border-border p-3">
```

Change the matching closing tag from `</div>}` back to `</div>` — find the promo-code block's closing:

```tsx
                            )}
                        </div>}

                        {/* Бонусные баллы */}
```

to:

```tsx
                            )}
                        </div>

                        {/* Бонусные баллы */}
```

- [ ] **Step 7: Typecheck and run the affected test suites**

Run: `npx tsc --noEmit`
Expected: no errors from any of the 6 files touched in this task.

Run: `npx vitest run lib/server-pricing.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/server-pricing.ts lib/server-pricing.test.ts lib/orders-data-store.ts app/api/orders/route.ts "app/[lang]/checkout/useCheckoutPage.tsx" "app/[lang]/checkout/page.tsx"
git commit -m "feat: remove discount-subscription plumbing from checkout and order pricing"
```

---

## Task 14: Delete the discount-subscription files

**Files:**
- Delete: `lib/subscription-store.ts`
- Delete: `app/api/subscriptions/route.ts`
- Delete: `app/api/subscriptions/route.test.ts`
- Delete: `app/api/subscriptions/[id]/route.ts`
- Delete: `app/api/subscriptions/[id]/route.test.ts`

By this point (after Tasks 8, 9, 13) nothing imports `@/lib/subscription-store` or hits `/api/subscriptions` anymore.

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "subscription-store\|/api/subscriptions" --include="*.ts" --include="*.tsx" app components lib hooks`
Expected: no output (empty)

- [ ] **Step 2: Delete the files**

```bash
git rm lib/subscription-store.ts
git rm -r app/api/subscriptions
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing these paths.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete discount-subscription store and API routes"
```

---

## Task 15: Delete the stock-notify files

**Files:**
- Delete: `lib/stock-notify-store.ts`
- Delete: `components/StockNotifyButton.tsx`
- Delete: `app/api/stock-notify/route.ts`
- Delete: `app/api/stock-notify/[id]/route.ts`
- Delete any `*.test.ts` alongside those route files if present.

By this point (after Task 9's account-section swap and Task 12's card/ProductStock cleanup) nothing imports `@/lib/stock-notify-store` or `StockNotifyButton` anymore.

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "stock-notify-store\|StockNotifyButton\|/api/stock-notify" --include="*.ts" --include="*.tsx" app components lib`
Expected: no output (empty)

- [ ] **Step 2: Delete the files**

```bash
git rm lib/stock-notify-store.ts components/StockNotifyButton.tsx
git rm -r app/api/stock-notify
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing these paths.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete stock-notify store, button and API routes"
```

---

## Task 16: GDPR export/erasure — swap `subscriptions`/`stockNotifications` for `productNews`

**Files:**
- Modify: `lib/user-erasure.ts`
- Modify: `lib/user-erasure.test.ts`
- Modify: `lib/user-export-pdf.ts`

This wasn't in the spec — found during planning. `lib/user-erasure.ts` powers the account's GDPR data export (Art. 15/20) and erasure-by-anonymisation (Art. 17) flows; it explicitly queries and deletes both `productSubscription` and `stockNotification` by name. Both models are gone after Task 1, so this must be updated in the same branch or GDPR export/erasure breaks at compile time.

- [ ] **Step 1: `lib/user-erasure.ts` — export**

Change the `UserExport` type:

```ts
export type UserExport = {
  exportedAt: string
  profile: Record<string, unknown>
  orders: unknown[]
  invoices: unknown[]
  reviews: unknown[]
  savedAddresses: unknown[]
  subscriptions: unknown[]
  stockNotifications: unknown[]
  returnRequests: unknown[]
```

to:

```ts
export type UserExport = {
  exportedAt: string
  profile: Record<string, unknown>
  orders: unknown[]
  invoices: unknown[]
  reviews: unknown[]
  savedAddresses: unknown[]
  productNews: unknown[]
  returnRequests: unknown[]
```

Change the destructured `Promise.all` result and its query list:

```ts
  const [profile, savedAddresses, subscriptions, stockNotifications, returnRequests, invoices,
    wishlist, notifications, accessRequests, invitations] =
    await Promise.all([
      id
        ? prisma.user.findUnique({
```

to:

```ts
  const [profile, savedAddresses, productNews, returnRequests, invoices,
    wishlist, notifications, accessRequests, invitations] =
    await Promise.all([
      id
        ? prisma.user.findUnique({
```

Change:

```ts
      prisma.savedAddress.findMany({ where: { email: emailLower } }),
      prisma.productSubscription.findMany({ where: id ? { OR: [{ userId: id }, { userEmail: emailLower }] } : { userEmail: emailLower } }),
      prisma.stockNotification.findMany({ where: id ? { OR: [{ userId: id }, { email: emailLower }] } : { email: emailLower } }),
      prisma.returnRequest.findMany({ where: { email: emailLower } }),
```

to:

```ts
      prisma.savedAddress.findMany({ where: { email: emailLower } }),
      id ? prisma.productNewsSubscription.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      prisma.returnRequest.findMany({ where: { email: emailLower } }),
```

(`productNewsSubscription` is account-only — like `wishlistItem`/`userNotification` right below it in the same list — so it's gated on `id` the same way, not matched by email for guests)

Change the return object:

```ts
    savedAddresses,
    subscriptions,
    stockNotifications,
    returnRequests,
```

to:

```ts
    savedAddresses,
    productNews,
    returnRequests,
```

- [ ] **Step 2: `lib/user-erasure.ts` — anonymisation**

Change:

```ts
    await tx.savedAddress.deleteMany({ where: { email: emailLower } })
    await tx.wishlistItem.deleteMany({ where: { userId: id } })
    await tx.stockNotification.deleteMany({ where: { OR: [{ userId: id }, { email: emailLower }] } })
    await tx.productSubscription.deleteMany({ where: { OR: [{ userId: id }, { userEmail: emailLower }] } })
    await tx.accessRequest.deleteMany({ where: { email: emailLower } })
```

to:

```ts
    await tx.savedAddress.deleteMany({ where: { email: emailLower } })
    await tx.wishlistItem.deleteMany({ where: { userId: id } })
    await tx.productNewsSubscription.deleteMany({ where: { userId: id } })
    await tx.accessRequest.deleteMany({ where: { email: emailLower } })
```

- [ ] **Step 3: `lib/user-erasure.test.ts` — update the prisma mock**

Change:

```ts
    savedAddress: { findMany: vi.fn().mockResolvedValue([]) },
    productSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    stockNotification: { findMany: vi.fn().mockResolvedValue([]) },
    returnRequest: { findMany: vi.fn().mockResolvedValue([]) },
```

to:

```ts
    savedAddress: { findMany: vi.fn().mockResolvedValue([]) },
    productNewsSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    returnRequest: { findMany: vi.fn().mockResolvedValue([]) },
```

Run: `npx vitest run lib/user-erasure.test.ts`
Expected: PASS (existing 3 tests still pass — none of them assert on `subscriptions`/`stockNotifications` directly, they check `wishlist`/`notifications`/`invitations`/`returnRequests`/`profile`)

- [ ] **Step 4: `lib/user-export-pdf.ts` — rename the PDF section**

Change:

```ts
  collection('Subscriptions', data.subscriptions)
  collection('Stock notifications', data.stockNotifications)
```

to:

```ts
  collection('Product news subscriptions', data.productNews)
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from these three files.

- [ ] **Step 6: Commit**

```bash
git add lib/user-erasure.ts lib/user-erasure.test.ts lib/user-export-pdf.ts
git commit -m "fix: point GDPR export/erasure at productNewsSubscription"
```

---

## Task 17: Live Neon migration — GATED, requires explicit confirmation

**Files:**
- Create (only once confirmed): `prisma/migrations/<timestamp>_add_product_news_subscription/migration.sql`

**⚠ STOP before Step 3.** Everything up to and including Step 2 is safe to run any time (it only reads the live schema and writes a local file — no DB mutation). Steps 3-5 apply the migration to live Neon and are **only** to be run after the user explicitly confirms, in this session, that they want it applied now. If that confirmation hasn't happened yet, stop after Step 2 and ask for it — do not proceed on your own judgment, and do not interpret earlier approval of the plan as approval for this specific step.

- [ ] **Step 1: Generate the diff SQL (no DB mutation)**

Run: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`

This prints the SQL to stdout, prefixed with some non-SQL banner lines ("Loaded Prisma config...", "injected env..."). Read the output, strip those banner lines, and write only the clean SQL statements to a scratch file first (do not redirect the raw command output straight to a file — the banner lines would end up inside the `.sql`).

Expected SQL shape: `DROP TABLE "ProductSubscription";`, `DROP TABLE "StockNotification";`, `CREATE TABLE "ProductNewsSubscription" (...)`, plus the matching indexes/unique constraint and the FK to `"User"`.

- [ ] **Step 2: Review the generated SQL**

Read the cleaned SQL back and confirm it contains exactly: two `DROP TABLE` statements (`ProductSubscription`, `StockNotification`) and one `CREATE TABLE "ProductNewsSubscription"` with its indexes/FK — nothing touching any other table. If it contains anything else, stop and investigate before proceeding (a stray unrelated diff would mean the live schema has drifted from what Task 1 assumed).

**⚠ Do not proceed past this point without the user's explicit "yes, apply it now."**

- [ ] **Step 3: Write the migration folder and apply it to live Neon**

```bash
mkdir -p prisma/migrations/<timestamp>_add_product_news_subscription
```

Write the reviewed SQL to `prisma/migrations/<timestamp>_add_product_news_subscription/migration.sql` (via the Write tool, not shell redirection).

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_product_news_subscription/migration.sql`
Expected: succeeds. (A transient `P1001` can happen over the Neon WebSocket adapter — just retry once.)

- [ ] **Step 4: Register the migration and regenerate the client**

Run: `npx prisma migrate resolve --applied <timestamp>_add_product_news_subscription`
Run: `npx prisma generate`

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "chore: apply ProductNewsSubscription migration to live Neon"
```

---

## Task 18: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, zero failures.

- [ ] **Step 3: Confirm no stray references survive anywhere**

Run: `grep -rn "subscription-store\|SubscriptionWidget\|AccountSubscriptionsSection\|useSubscriptionReminders\|stock-notify-store\|StockNotifyButton\|AccountStockNotificationsSection\|productSubscription\.\|stockNotification\." --include="*.ts" --include="*.tsx" app components lib hooks`
Expected: no output. (Matches inside `docs/superpowers/**` are fine — those are historical plans/specs, not live code.)

- [ ] **Step 4: Manual browser verification**

Use the `verify` skill to build and run the app, then walk through:
1. As a guest, open a product page — confirm no notify widget renders, no console errors.
2. Log in as a real user, open a product page, click "Уведомить о новостях", confirm all three checkboxes are checked by default, subscribe. Confirm the widget now shows the active state with all three types listed.
3. Reload the page — confirm the subscription persists (hydrated from `/api/product-news`).
4. Go to `/account`, confirm the unified "Новости о товарах" section lists that product with three checked boxes; uncheck "Акции и скидки" and confirm it persists after reload.
5. Unsubscribe from the account section; confirm the product page widget reverts to the "notify me" button on reload.
6. As admin, edit that product's price in `/admin/products/[id]` and save. As the subscribed user, check `/account` notifications — confirm a price-change notification arrived with the old/new price.
7. As admin, use the quick stock-edit field on the admin catalog card to move a 0-stock, subscribed-to product to a positive stock. Confirm the subscriber gets a restock notification.
8. As admin, open that product's edit page, click "Уведомить подписчиков", type a short message, send. Confirm the subscriber gets a promo notification with that text.
9. Add an item to cart, go to checkout, confirm: no leftover subscription discount notice, promo-code box always renders, order completes normally.
10. Confirm the two live legacy `ProductSubscription` rows (if Task 17 has run) no longer error anything — they're gone from the DB and nothing queries them.

- [ ] **Step 5: Report results**

Summarize pass/fail for each of the above 10 manual checks plus the automated results from Steps 1-3.
