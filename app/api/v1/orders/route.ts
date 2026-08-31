import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { logApiError } from '@/lib/observability'
import { authenticateRequest, successResponse, errorResponse, parsePagination } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { createServerOrder, ExistingCheckoutOrderError, InsufficientStockError, type ServerOrder } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

/**
 * GET /api/v1/orders
 * Paginated list of the calling company's orders (read from the DB, scoped by companyId).
 *
 * Query: page, limit, paymentStatus, sortBy (date|total), sortOrder (asc|desc)
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    // Orders are tenant-scoped by companyId. Without a company scope we must not return
    // every order in the system, so require it.
    const companyId = auth.user.companyId
    if (!companyId) {
      return errorResponse('Company scope required (x-company-id)', 400)
    }

    const { page, limit, offset } = parsePagination(req)
    const { searchParams } = new URL(req.url)

    const where: Record<string, unknown> = { companyId }
    const paymentStatus = searchParams.get('paymentStatus')
    if (paymentStatus) where.paymentStatus = paymentStatus

    const dir: 'asc' | 'desc' = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
    const orderBy =
      searchParams.get('sortBy') === 'total' ? { total: dir } : { createdAt: dir }

    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy, skip: offset, take: limit }),
      prisma.order.count({ where }),
    ])

    return successResponse({
      orders: rows.map((o) => ({
        id: o.id,
        email: o.email,
        createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
        items: o.items,
        subtotal: o.subtotal,
        total: o.total,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        address: {
          firstName: o.firstName,
          lastName: o.lastName,
          address: o.address,
          city: o.city,
          postalCode: o.postalCode,
          phone: o.phone,
        },
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    logApiError("[v1/orders GET]", error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/v1/orders
 * Create an order (API key required). Prices are recomputed server-side from the catalog;
 * client-supplied prices are ignored.
 *
 * Body: { items: [{ productId, quantity }], address: {...}, payment?, promoCode?, deliveryMethod?, notes? }
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }
    if (!auth.user.apiAccess) {
      return errorResponse('API access required', 403)
    }
    if (!auth.user.companyId) {
      return errorResponse('Company scope required', 400)
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? ''
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return errorResponse('Invalid idempotency key', 400)
    }

    const body = await req.json()
    const { items, address, payment, notes } = body as {
      items?: Array<{ productId?: string; quantity?: number }>
      address?: Record<string, string>
      payment?: string
      notes?: string
    }

    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse('Invalid items', 400)
    }
    if (!address) {
      return errorResponse('Address is required', 400)
    }

    const normalizedItems = items
      .filter((i) => typeof i.productId === 'string' && i.productId.length > 0)
      .map((i) => ({ id: i.productId as string, quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)) }))

    if (normalizedItems.length === 0) {
      return errorResponse('No valid items', 400)
    }

    const customerEmail = (typeof body.email === 'string' && body.email) || auth.user.email || 'api-user@example.com'
    // Build full order line items from the catalog (title/brand/etc.) for display.
    const products = await prisma.product.findMany({
      where: { id: { in: normalizedItems.map((i) => i.id) } },
      select: { id: true, title: true, brand: true, image: true, category: true, rating: true, stock: true },
    })
    const productById = new Map(products.map((p) => [p.id, p]))

    const orderItems = normalizedItems.map((line) => {
      const p = productById.get(line.id)
      return {
        id: line.id,
        title: p?.title ?? line.id,
        brand: p?.brand ?? '',
        image: p?.image ?? '',
        category: p?.category ?? '',
        price: 0,
        rating: p?.rating ?? 0,
        stock: p?.stock ?? 0,
        quantity: line.quantity,
      }
    })

    const order: Omit<ServerOrder, 'id'> = {
      createdAt: new Date().toISOString(),
      items: orderItems,
      subtotal: 0,
      tax: 0,
      delivery: 0,
      deliveryMethod: typeof body.deliveryMethod === 'string' ? body.deliveryMethod : 'courier',
      paymentMethod: payment || 'transfer',
      discount: 0,
      total: 0,
      firstName: address.firstName || 'API',
      lastName: address.lastName || 'User',
      email: customerEmail,
      phone: address.phone || '',
      address: address.address || '',
      city: address.city || '',
      postalCode: address.postalCode,
      paymentStatus: 'unpaid',
      companyId: auth.user.companyId,
      userId: auth.user.id,
      language: 'ru',
      checkoutKey: idempotencyKey
        ? createHash('sha256').update(`${auth.user.companyId}:${idempotencyKey}`).digest('hex')
        : undefined,
    }

    const created = await createServerOrder(order, async (tx) => {
      const pricing = await recomputeOrderPricing({
        items: normalizedItems,
        promoCode: typeof body.promoCode === 'string' ? body.promoCode : undefined,
        deliveryMethod: order.deliveryMethod,
        userBonusBalance: null,
        userId: auth.user.id,
        email: customerEmail,
      }, tx)
      return {
        ...order,
        items: order.items.map((item, index) => ({
          ...item,
          price: pricing.items[index]?.price ?? 0,
          quantity: pricing.items[index]?.quantity ?? item.quantity,
        })),
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        delivery: pricing.delivery,
        discount: pricing.discount,
        promoCode: pricing.promoApplied && typeof body.promoCode === 'string'
          ? body.promoCode.trim().toUpperCase() : undefined,
        total: pricing.total,
      }
    })

    return successResponse(
      {
        orderId: created.id,
        status: created.paymentStatus,
        total: created.total,
        createdAt: created.createdAt,
        notes,
        message: 'Order created successfully',
      },
      201
    )
  } catch (error) {
    if (error instanceof ExistingCheckoutOrderError) {
      return successResponse({
        orderId: error.order.id, status: error.order.paymentStatus,
        total: error.order.total, createdAt: error.order.createdAt,
        message: 'Order already created', idempotent: true,
      }, 200)
    }
    if (error instanceof InsufficientStockError) {
      return errorResponse(`Insufficient stock for: ${error.items.join(', ')}`, 409)
    }
    logApiError("[v1/orders POST]", error)
    return errorResponse('Internal server error', 500)
  }
}
