import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission } from '@/lib/server-auth'
import { buildInvoiceHtml, type InvoiceLang } from '@/lib/invoice-template'
import { sendEmail } from '@/lib/mailer'
import { getServerOrderById } from '@/lib/orders-data-store'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest): Promise<NextResponse> {
  const __gate = await requireAdminPermission('orders.update')
  if (__gate instanceof NextResponse) return __gate

  // Auth: require X-Admin-Token header matching ADMIN_API_TOKEN env var
  const adminToken = process.env.ADMIN_API_TOKEN
  if (adminToken) {
    const provided = request.headers.get('x-admin-token')
    if (!provided || provided !== adminToken) {
      return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
    }
  }

  let body: { orderId: string; email: string; language?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { orderId, email } = body

  if (!orderId || !email) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  // Инвойс по умолчанию латышский; английский — по запросу покупателя
  if (body.language !== undefined && !['lv', 'en'].includes(body.language)) {
    return NextResponse.json({ ok: false, code: 'invalid_language' }, { status: 422 })
  }
  const lang: InvoiceLang = body.language === 'en' ? 'en' : 'lv'

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, code: 'invalid_email' }, { status: 422 })
  }

  // Load order from server-side store — never trust client-supplied order data
  const order = await getServerOrderById(orderId)
  if (!order) {
    return NextResponse.json({ ok: false, code: 'order_not_found' }, { status: 404 })
  }

  // Названия товаров на языке инвойса; для EN фолбэк — латышское название
  const orderItemIds = new Set(order.items.map((i) => i.id))
  const products = await getMergedProducts()
  const titles: Record<string, string> = {}
  for (const p of products) {
    if (!orderItemIds.has(p.id)) continue
    const title = lang === 'en' ? p.titleEn || p.titleLv : p.titleLv
    if (title) titles[p.id] = title
  }

  const subject = lang === 'en' ? `Invoice for order #${order.id}` : `Rēķins pasūtījumam #${order.id}`
  const html = buildInvoiceHtml(order as unknown as Parameters<typeof buildInvoiceHtml>[0], titles, lang, getSiteUrl())

  try {
    await sendEmail(email, subject, html)
  } catch (err) {
    logApiError("[send-invoice] error:", err)
    return NextResponse.json({ ok: false, code: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}




