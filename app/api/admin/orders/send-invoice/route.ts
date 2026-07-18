import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { sendEmail } from '@/lib/mailer'
import { getServerOrderById } from '@/lib/orders-data-store'
import { getMergedProducts } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest): Promise<NextResponse> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  // Auth: require X-Admin-Token header matching ADMIN_API_TOKEN env var
  const adminToken = process.env.ADMIN_API_TOKEN
  if (adminToken) {
    const provided = request.headers.get('x-admin-token')
    if (!provided || provided !== adminToken) {
      return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
    }
  }

  let body: { orderId: string; email: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { orderId, email } = body

  if (!orderId || !email) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, code: 'invalid_email' }, { status: 422 })
  }

  // Load order from server-side store — never trust client-supplied order data
  const order = await getServerOrderById(orderId)
  if (!order) {
    return NextResponse.json({ ok: false, code: 'order_not_found' }, { status: 404 })
  }

  // Инвойс всегда на латышском: названия товаров берём из Product.titleLv
  const orderItemIds = new Set(order.items.map((i) => i.id))
  const products = await getMergedProducts()
  const lvTitles: Record<string, string> = {}
  for (const p of products) {
    if (orderItemIds.has(p.id) && p.titleLv) lvTitles[p.id] = p.titleLv
  }

  const subject = `Rēķins pasūtījumam #${order.id}`
  const html = buildInvoiceHtml(order as unknown as Parameters<typeof buildInvoiceHtml>[0], lvTitles)

  try {
    await sendEmail(email, subject, html)
  } catch (err) {
    console.error('[send-invoice] error:', err)
    return NextResponse.json({ ok: false, code: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
