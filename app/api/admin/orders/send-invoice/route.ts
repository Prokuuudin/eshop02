import { NextRequest, NextResponse } from 'next/server'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { sendEmail } from '@/lib/mailer'
import { getServerOrderById } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: require X-Admin-Token header matching ADMIN_API_TOKEN env var
  const adminToken = process.env.ADMIN_API_TOKEN
  if (adminToken) {
    const provided = request.headers.get('x-admin-token')
    if (!provided || provided !== adminToken) {
      return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
    }
  }

  let body: { orderId: string; language: string; email: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { orderId, language, email } = body

  if (!orderId || !email || !language) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  if (!['ru', 'en', 'lv'].includes(language)) {
    return NextResponse.json({ ok: false, code: 'invalid_language' }, { status: 422 })
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, code: 'invalid_email' }, { status: 422 })
  }

  // Load order from server-side store — never trust client-supplied order data
  const order = await getServerOrderById(orderId)
  if (!order) {
    return NextResponse.json({ ok: false, code: 'order_not_found' }, { status: 404 })
  }

  const lang = language as 'ru' | 'en' | 'lv'

  const subjects: Record<string, string> = {
    ru: `Счёт по заказу #${order.id}`,
    en: `Invoice for order #${order.id}`,
    lv: `Rēķins pasūtījumam #${order.id}`,
  }

  const html = buildInvoiceHtml(order as Parameters<typeof buildInvoiceHtml>[0], lang)

  try {
    await sendEmail(email, subjects[lang], html)
  } catch (err) {
    console.error('[send-invoice] error:', err)
    return NextResponse.json({ ok: false, code: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
