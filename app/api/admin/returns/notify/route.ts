import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const STATUS_LABELS: Record<string, string> = {
  pending:   'Заявка получена',
  approved:  'Заявка одобрена',
  rejected:  'Заявка отклонена',
  refunded:  'Средства возвращены',
  completed: 'Возврат завершён',
}

const STATUS_DETAILS: Record<string, string> = {
  pending:   'Мы получили вашу заявку и рассматриваем её.',
  approved:  'Ваша заявка на возврат одобрена. Мы свяжемся с вами для уточнения деталей.',
  rejected:  'К сожалению, мы не можем одобрить возврат по данной заявке.',
  refunded:  'Средства возвращены. Ожидайте их поступления в течение 3–5 рабочих дней.',
  completed: 'Возврат успешно завершён. Спасибо, что обратились к нам.',
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as {
      to?: string
      firstName?: string
      returnId?: string
      orderId?: string
      status?: string
      refundAmount?: number
      resolution?: string
    }

    const to = body.to?.trim() ?? ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const status = body.status ?? 'pending'
    const statusLabel = STATUS_LABELS[status] ?? status
    const statusDetail = STATUS_DETAILS[status] ?? ''
    const firstName = body.firstName ?? 'Клиент'
    const returnId = body.returnId ?? '—'
    const orderId = body.orderId ?? '—'
    const refundAmount = body.refundAmount ?? 0
    const resolution = body.resolution

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Статус вашей заявки на возврат</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#374151">Здравствуйте, ${firstName}!</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr>
              <td style="padding:4px 0;color:#6b7280;width:140px">Заявка №</td>
              <td style="padding:4px 0;font-family:monospace;font-weight:600">${returnId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6b7280">Заказ №</td>
              <td style="padding:4px 0;font-family:monospace">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6b7280">Статус</td>
              <td style="padding:4px 0;font-weight:600;color:#4f46e5">${statusLabel}</td>
            </tr>
            ${refundAmount > 0 ? `<tr>
              <td style="padding:4px 0;color:#6b7280">Сумма возврата</td>
              <td style="padding:4px 0;font-weight:600">€${refundAmount.toFixed(2)}</td>
            </tr>` : ''}
          </table>
        </div>
        <p style="margin:0 0 12px;font-size:14px;color:#374151">${statusDetail}</p>
        ${resolution ? `<div style="border-left:3px solid #6366f1;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#374151;font-style:italic">${resolution}</div>` : ''}
        <p style="margin:0;font-size:13px;color:#9ca3af">Если у вас есть вопросы, ответьте на это письмо или свяжитесь с нами.</p>
      </div>`

    const subject = `[Возврат ${returnId}] ${statusLabel}`
    await sendEmail(to, subject, html)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[returns/notify]', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}
