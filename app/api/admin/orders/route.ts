import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import {
  AdminOrderUpdateError,
  updateServerOrderByAdmin,
  createServerOrder,
  InsufficientStockError,
  PromoCodeUsageLimitError,
  type ServerOrder,
} from '@/lib/orders-data-store'
import { parseOffsetPagination } from '@/lib/pagination'
import { adminOrderCreateSchema, adminOrderUpdateSchema } from '@/lib/api-schemas'
import { appendServerAudit } from '@/lib/server-audit'
import { productIdsForDamagedOrderItems, repairOrderItemTitles } from '@/lib/order-item-title-repair'

// Mirrors the delivery cost table shown in the admin "new order" form
// (app/[lang]/admin/orders/new) - computed here too so a tampered client
// request can't set an arbitrary delivery cost.
const DELIVERY_COSTS: Record<string, number> = { pickup: 0, courier: 5, post: 3 }

const ORDER_STATUS_VALUES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const payment = searchParams.get('payment') || ''
    const deliveryMethod = searchParams.get('deliveryMethod') || ''
    const statusParam = searchParams.get('status') || ''
    const status = (ORDER_STATUS_VALUES as readonly string[]).includes(statusParam) ? statusParam : ''
    const sortField = searchParams.get('sort') === 'total' ? 'total' : 'createdAt'
    const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 200 })

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (payment) where.paymentStatus = payment
    if (deliveryMethod) where.deliveryMethod = deliveryMethod

    // OrderStatusRecord is sparse (no row = 'pending', same fallback used
    // everywhere else) so a status filter is resolved as an id set first,
    // rather than joined directly into the Prisma `where`.
    if (status) {
      const matchingIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT o.id
        FROM "Order" o
        LEFT JOIN "OrderStatusRecord" osr ON osr."orderId" = o.id
        WHERE COALESCE(osr.status, 'pending') = ${status}
      `
      where.id = { in: matchingIds.map((row) => row.id) }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ])
    const orderIds = orders.map((order) => order.id)
    const [statusRows, noteRows] = orderIds.length > 0
      ? await Promise.all([
          prisma.orderStatusRecord.findMany({ where: { orderId: { in: orderIds } } }),
          prisma.orderNote.findMany({ where: { orderId: { in: orderIds } } }),
        ])
      : [[], []]
    const statuses = Object.fromEntries(statusRows.map((row) => [row.orderId, row.status]))
    const notes = Object.fromEntries(noteRows.map((row) => [row.orderId, row.note]))

    const damagedProductIds = productIdsForDamagedOrderItems(orders.map((row) => row.items))
    const titleRows = damagedProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: damagedProductIds } },
          select: { id: true, title: true },
        })
      : []
    const catalogTitles = new Map(titleRows.map((product) => [product.id, product.title]))

    const mapped = orders.map((row) => ({
      ...row,
      items: repairOrderItemTitles(row.items, catalogTitles),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))

    return NextResponse.json({ orders: mapped, total, statuses, notes })
  } catch (e) {
    logApiError("[admin/orders GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST /api/admin/orders — staff-entered manual order (phone/in-store sale, etc).
// Unlike public checkout, the admin may override a line item's unit price, but
// every other money field (subtotal/discount/delivery/total) is still
// recomputed server-side, never trusted from the client.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireAdminPermission('orders.update')
  if (user instanceof NextResponse) return user

  const parsed = adminOrderCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_order', issues: parsed.error.issues }, { status: 400 })
  }
  const input = parsed.data

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.id) } },
      select: { id: true, title: true, brand: true, image: true, category: true, rating: true, stock: true, isDeleted: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))
    const missing = input.items.filter((i) => !byId.get(i.id) || byId.get(i.id)!.isDeleted).map((i) => i.id)
    if (missing.length > 0) {
      return NextResponse.json({ error: 'invalid_items', items: missing }, { status: 400 })
    }

    const items = input.items.map((i) => {
      const p = byId.get(i.id)!
      return {
        id: p.id, title: p.title, brand: p.brand, image: p.image ?? '', category: p.category,
        price: i.unitPrice, rating: p.rating ?? 0, stock: p.stock, quantity: i.quantity,
      }
    })

    const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100
    const discount = Math.min(input.discount, subtotal)
    const delivery = DELIVERY_COSTS[input.deliveryMethod] ?? 0
    const total = Math.max(0, Math.round((subtotal - discount + delivery) * 100) / 100)

    const existingCustomer = await prisma.user.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true, companyId: true },
    })

    const orderBase: Omit<ServerOrder, 'id'> = {
      createdAt: new Date().toISOString(),
      items,
      subtotal,
      tax: 0,
      delivery,
      deliveryMethod: input.deliveryMethod,
      paymentMethod: input.paymentMethod,
      promoCode: input.promoCode,
      discount,
      total,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      email: input.email,
      phone: input.phone ?? '',
      address: input.address || 'Самовывоз',
      city: input.city || '—',
      postalCode: input.postalCode,
      paymentStatus: input.paymentStatus,
      paymentProvider: 'manual',
      stockReservationStatus: 'committed',
      userId: existingCustomer?.id,
      companyId: existingCustomer?.companyId ?? undefined,
    }

    const created = await createServerOrder(orderBase)

    // Staff already processed this sale, so it starts confirmed (not pending)
    // and, unlike a status transition on an existing order, this can't fail
    // the create - the order row already exists at this point.
    let metaWarning: string | undefined
    try {
      await prisma.$transaction(async (tx) => {
        await tx.orderStatusRecord.create({ data: { orderId: created.id, status: 'confirmed' } })
        if (input.notes) {
          await tx.orderNote.create({ data: { orderId: created.id, note: input.notes } })
        }
        await appendServerAudit(tx, req, user, {
          action: 'order.created', entityType: 'order', entityId: created.id,
          entityTitle: `${created.firstName} ${created.lastName}`.trim(),
          after: { total: created.total, items: created.items.length, paymentMethod: created.paymentMethod },
          details: `Ручное создание заказа на ${created.total.toFixed(2)} €`,
        })
      })
    } catch (metaError) {
      logApiError("[admin/orders POST meta]", metaError)
      metaWarning = 'order_saved_status_note_failed'
    }

    return NextResponse.json({ order: created, ...(metaWarning ? { warning: metaWarning } : {}) }, { status: 201 })
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: 'insufficient_stock', items: error.items }, { status: 409 })
    }
    if (error instanceof PromoCodeUsageLimitError) {
      return NextResponse.json({ error: 'promo_code_usage_limit' }, { status: 409 })
    }
    logApiError("[admin/orders POST]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await requireAdminPermission('orders.update')
  if (user instanceof NextResponse) return user

  const parsed = adminOrderUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_order_update', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { orderId, ...input } = parsed.data
    const order = await updateServerOrderByAdmin(orderId, input, user, req)
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof AdminOrderUpdateError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'insufficient_stock' ? 409 : 422
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }
    logApiError("[admin/orders PATCH]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
