import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdmin } from "@/lib/server-auth"
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { toNum } from '@/lib/decimal'

export const runtime = 'nodejs'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

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

type ReturnMailLang = 'ru' | 'en' | 'lv'

const RETURN_MAIL = {
  ru: {
    title: 'Статус вашей заявки на возврат', greeting: 'Здравствуйте', request: 'Заявка №', order: 'Заказ №',
    status: 'Статус', amount: 'Сумма возврата', footer: 'Если у вас есть вопросы, ответьте на это письмо или свяжитесь с нами.',
  },
  en: {
    title: 'Your return request status', greeting: 'Hello', request: 'Request #', order: 'Order #',
    status: 'Status', amount: 'Refund amount', footer: 'If you have any questions, reply to this email or contact us.',
  },
  lv: {
    title: 'Jūsu atgriešanas pieprasījuma statuss', greeting: 'Labdien', request: 'Pieprasījums Nr.', order: 'Pasūtījums Nr.',
    status: 'Statuss', amount: 'Atmaksas summa', footer: 'Ja jums ir jautājumi, atbildiet uz šo e-pastu vai sazinieties ar mums.',
  },
} satisfies Record<ReturnMailLang, Record<string, string>>

const RETURN_STATUS: Record<ReturnMailLang, Record<string, { label: string; detail: string }>> = {
  ru: Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, { label: STATUS_LABELS[status], detail: STATUS_DETAILS[status] }])),
  en: {
    pending: { label: 'Request received', detail: 'We received your request and are reviewing it.' },
    approved: { label: 'Request approved', detail: 'Your return request has been approved. We will contact you with the next steps.' },
    rejected: { label: 'Request rejected', detail: 'Unfortunately, we cannot approve this return request.' },
    refunded: { label: 'Funds refunded', detail: 'The funds have been refunded. Please allow 3–5 business days for them to arrive.' },
    completed: { label: 'Return completed', detail: 'Your return has been completed successfully.' },
  },
  lv: {
    pending: { label: 'Pieprasījums saņemts', detail: 'Mēs saņēmām jūsu pieprasījumu un to izskatām.' },
    approved: { label: 'Pieprasījums apstiprināts', detail: 'Jūsu atgriešanas pieprasījums ir apstiprināts. Mēs sazināsimies par nākamajiem soļiem.' },
    rejected: { label: 'Pieprasījums noraidīts', detail: 'Diemžēl mēs nevaram apstiprināt šo atgriešanas pieprasījumu.' },
    refunded: { label: 'Nauda atmaksāta', detail: 'Nauda ir atmaksāta. Lūdzu, uzgaidiet 3–5 darba dienas.' },
    completed: { label: 'Atgriešana pabeigta', detail: 'Jūsu atgriešana ir veiksmīgi pabeigta.' },
  },
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as {
      returnId?: string
      // A resolution note the admin may be about to send before saving it -
      // the record itself is still the source of truth for who gets emailed,
      // and for the order/status/amount shown in that email.
      resolution?: string
      language?: string
    }

    const returnId = body.returnId?.trim() ?? ''
    if (!returnId) {
      return NextResponse.json({ error: 'return_id_required' }, { status: 400 })
    }

    // Recipient, order, status and refund amount all come from the actual
    // return record - never from the client - so this endpoint can't be used
    // to send an arbitrary-looking "refund" notice to an arbitrary address.
    const record = await prisma.returnRequest.findUnique({ where: { id: returnId } })
    if (!record) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const to = record.email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const language: ReturnMailLang = ['ru', 'en', 'lv'].includes(body.language ?? '') ? body.language as ReturnMailLang : 'ru'
    const copy = RETURN_MAIL[language]
    const status = record.status
    const statusCopy = RETURN_STATUS[language][status]
    const statusLabel = statusCopy?.label ?? status
    const statusDetail = statusCopy?.detail ?? ''
    const firstName = escHtml(record.firstName || 'Клиент')
    const orderId = record.orderId
    const refundAmount = toNum(record.refundAmount)
    const resolution = body.resolution ?? record.resolution ?? undefined

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827">${copy.title}</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#374151">${copy.greeting}, ${firstName}!</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr>
              <td style="padding:4px 0;color:#6b7280;width:140px">${copy.request}</td>
              <td style="padding:4px 0;font-family:monospace;font-weight:600">${escHtml(returnId)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6b7280">${copy.order}</td>
              <td style="padding:4px 0;font-family:monospace">${escHtml(orderId)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6b7280">${copy.status}</td>
              <td style="padding:4px 0;font-weight:600;color:#4f46e5">${escHtml(statusLabel)}</td>
            </tr>
            ${refundAmount > 0 ? `<tr>
              <td style="padding:4px 0;color:#6b7280">${copy.amount}</td>
              <td style="padding:4px 0;font-weight:600">€${refundAmount.toFixed(2)}</td>
            </tr>` : ''}
          </table>
        </div>
        <p style="margin:0 0 12px;font-size:14px;color:#374151">${statusDetail}</p>
        ${resolution ? `<div style="border-left:3px solid #6366f1;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#374151;font-style:italic">${escHtml(resolution)}</div>` : ''}
        <p style="margin:0;font-size:13px;color:#9ca3af">${copy.footer}</p>
      </div>`

    const subject = `[${copy.title} ${returnId}] ${statusLabel}`
    await sendEmail(to, subject, html)

    await prisma.$transaction((tx) => appendServerAudit(tx, request, __gate, {
      action: 'return.notified', entityType: 'return', entityId: returnId,
      entityTitle: `${record.firstName} ${record.lastName}`.trim(),
      details: `Уведомление о статусе «${statusLabel}» отправлено на ${to}`,
    }))

    return NextResponse.json({ ok: true })
  } catch (err) {
    logApiError("[returns/notify]", err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}




