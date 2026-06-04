import { NextRequest, NextResponse } from 'next/server'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { order: unknown; language: string; email: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { order, language, email } = body

  if (!order || !email || !language) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  if (!['ru', 'en', 'lv'].includes(language)) {
    return NextResponse.json({ ok: false, code: 'invalid_language' }, { status: 422 })
  }

  const lang = language as 'ru' | 'en' | 'lv'

  const subjects: Record<string, string> = {
    ru: `Счёт по заказу #${(order as { id: string }).id}`,
    en: `Invoice for order #${(order as { id: string }).id}`,
    lv: `Rēķins pasūtījumam #${(order as { id: string }).id}`,
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
