import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse, parsePagination } from '@/lib/api-helpers'
import { useOrders } from '@/lib/orders-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { triggerCompanyWebhook } from '@/lib/webhook-sender'

/**
 * GET /api/v1/orders
 * Returns paginated list of company orders
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - status: string (optional) - pending, processing, shipped, delivered, cancelled
 * - sortBy: string (optional) - date, total, status (default: date)
 * - sortOrder: asc|desc (optional, default: desc)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    const { page, limit, offset } = parsePagination(req)
    const { searchParams } = new URL(req.url)

    const ordersStore = useOrders.getState()
    let orders = [...ordersStore.orders] as Array<Record<string, any>>

    // Filter by status if provided
    const status = searchParams.get('status')
    if (status) {
      orders = orders.filter((o) => (o.status || 'processing') === status)
    }

    // Filter by company if user has companyId
    if (auth.user.companyId) {
      orders = orders.filter((o) => o.companyId === auth.user.companyId || !o.companyId)
    }

    // Sort
    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1

    orders.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'total':
          aVal = a.total || 0
          bVal = b.total || 0
          break
        case 'status':
          aVal = (a.status || '').localeCompare(b.status || '')
          return aVal * sortOrder
        case 'date':
        default:
          aVal = new Date(a.createdAt).getTime()
          bVal = new Date(b.createdAt).getTime()
      }
      return (aVal - bVal) * sortOrder
    })

    const total = orders.length
    const paginatedOrders = orders.slice(offset, offset + limit)

    return successResponse({
      orders: paginatedOrders.map(order => ({
        id: order.id,
        email: order.email,
        status: order.status || 'processing',
        createdAt: order.createdAt,
        items: order.items,
        total: order.total,
        address: {
          firstName: order.firstName,
          lastName: order.lastName,
          address: order.address,
          city: order.city,
          postalCode: order.postalCode,
          phone: order.phone
        },
        payment: order.paymentMethod
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/v1/orders
 * Create a new order (API key required)
 * 
 * Body:
 * {
 *   "items": [{ "productId": "p1", "quantity": 2 }],
 *   "address": { "street": "...", "city": "...", ... },
 *   "payment": "card|invoice|transfer",
 *   "notes": "optional"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    // API key access only for this endpoint
    if (!auth.user.apiAccess) {
      return errorResponse('API access required', 403)
    }

    const body = await req.json()
    const { items, address, payment, notes } = body

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse('Invalid items', 400)
    }

    if (!address) {
      return errorResponse('Address is required', 400)
    }

    const ordersStore = useOrders.getState()

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    const newOrder = {
      id: orderId,
      createdAt: new Date(),
      items: items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price || 0
      })),
      subtotal: Number(body.subtotal || 0),
      tax: Number(body.tax || 0),
      delivery: Number(body.delivery || 0),
      deliveryMethod: body.deliveryMethod || 'courier',
      paymentMethod: payment || 'transfer',
      discount: Number(body.discount || 0),
      total: Number(body.total || 0),
      firstName: address?.firstName || 'API',
      lastName: address?.lastName || 'User',
      email: body.email || auth.user.email || 'api-user@example.com',
      phone: address?.phone || '',
      address: address?.address || '',
      city: address?.city || '',
      postalCode: address?.postalCode,
      notes,
      companyId: auth.user.companyId,
      status: 'processing'
    }

    ordersStore.addOrder(newOrder as any)

    // Log audit action
    if (auth.user.companyId) {
      logAuditAction(
        auth.user.companyId,
        auth.user.id,
        'order_created',
        { source: 'api', orderId, itemCount: items.length }
      )

      await triggerCompanyWebhook(auth.user.companyId, 'order.created', {
        orderId,
        itemCount: items.length,
        total: newOrder.total,
        createdAt: newOrder.createdAt.toISOString()
      })
    }

    return successResponse({
      orderId,
      status: newOrder.status,
      createdAt: newOrder.createdAt,
      message: 'Order created successfully'
    }, 201)
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
