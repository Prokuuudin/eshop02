import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { escapeHtml as escHtml } from '@/lib/escape-html'
import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type Context = {
  params: Promise<{ id: string }>
}

/**
 * Lets a customer hand their own personal code to staff for one specific
 * invoice, on their own initiative — without it ever touching the database.
 * The code is relayed to CONTACT_TO as a one-off email; staff pastes it into
 * OrderInvoiceModal when generating that invoice and it is then discarded.
 * Invoice generation itself stays a manager action (see bd63e96) — this
 * endpoint never generates or sends an invoice by itself.
 */
export async function POST(req: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const order = await getServerOrderById(id)
    if (!order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    }

    // Same IDOR guard as GET /api/orders/[id] — never confirm a foreign order exists,
    // and never let a stranger attribute an arbitrary code to someone else's order.
    const caller = await getServerUser()
    if (!caller || !canAccessOrder(order, caller)) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    }

    const limited = await checkRateLimit(`invoice-code-request:${caller.id}`, {
      windowMs: 60 * 60 * 1000,
      maxAttempts: 5,
    })
    if (limited.limited) {
      return NextResponse.json({ error: 'rate_limited', resetAt: limited.resetAt }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))) },
      })
    }

    let body: { personalCode?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const personalCode = typeof body.personalCode === 'string' ? body.personalCode.trim() : ''
    if (!personalCode) {
      return NextResponse.json({ error: 'missing_personal_code' }, { status: 400 })
    }
    if (personalCode.length > 64) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }

    const adminEmail = process.env.CONTACT_TO
    if (!adminEmail) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    }

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
<h2>Клиент прислал персональный код для счёта</h2>
<p>Заказ: <strong>№${escHtml(order.id)}</strong></p>
<p>Клиент: ${escHtml(order.firstName ?? '')} ${escHtml(order.lastName ?? '')} (${escHtml(order.email ?? '')})</p>
<p>Персональный код: <strong>${escHtml(personalCode)}</strong></p>
<p style="color:#666">Нигде не сохранён — вставьте вручную в поле «Персональный код» при формировании счёта для этого заказа в админке.</p>
</div>`

    await sendEmail(adminEmail, `Персональный код для счёта — заказ №${order.id}`, html)

    return NextResponse.json({ ok: true })
  } catch (error) {
    logApiError('[request-invoice-code] error:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
