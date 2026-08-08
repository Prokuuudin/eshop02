import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getInvoicesByCompany, createInvoiceInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'
import { getServerOrderById, canAccessOrder } from '@/lib/orders-data-store'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId_required' }, { status: 400 })

    // Non-admins can only read their own company's invoices
    if (user.platformRole !== 'admin' && user.companyId !== companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const invoices = await getInvoicesByCompany(companyId)
    return NextResponse.json({ invoices })
  } catch (e) {
    logApiError("[invoices GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!body.id || !body.invoiceNumber || !body.companyId || !body.orderId) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Money must come from the authoritative order, never from the client נotherwise a
    // buyer could self-issue an invoice with a fabricated total (e.g. 0.01) at checkout.
    const order = await getServerOrderById(String(body.orderId))
    if (!order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 400 })
    }

    // The caller must own the referenced order (admins may act for any order).
    if (user.platformRole !== 'admin' && !canAccessOrder(order, user)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Bind the invoice to the order's own company, and reject a mismatched claim from a non-admin.
    const companyId = order.companyId ?? user.companyId ?? ''
    if (user.platformRole !== 'admin' && user.companyId !== companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const invoice = await createInvoiceInDb({
      id: String(body.id),
      invoiceNumber: String(body.invoiceNumber),
      companyId,
      orderId: order.id,
      // Authoritative amounts from the order נclient values are ignored.
      subtotal: order.subtotal,
      taxAmount: order.tax,
      total: order.total,
      taxRate: typeof body.taxRate === 'number' ? body.taxRate : 21,
      // A new invoice is always issued; only admins can move it to a settled state later.
      status: 'issued',
      issuedDate: body.issuedDate ? new Date(body.issuedDate) : new Date(),
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
      paidDate: undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      // Line items derived from the order, not trusted from the client.
      items: order.items.map((it) => ({
        productId: it.id,
        productTitle: it.title,
        quantity: it.quantity,
        unitPrice: it.price,
        total: it.price * it.quantity,
      })),
    })
    return NextResponse.json({ invoice })
  } catch (e) {
    logApiError("[invoices POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





