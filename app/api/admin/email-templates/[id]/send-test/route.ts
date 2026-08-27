import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdmin } from '@/lib/server-auth'
import { getTemplates } from '@/lib/email-templates-server-store'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SAMPLE: Record<string, string> = {
  order_id: 'ORD-2025-001',
  first_name: 'Иван',
  last_name: 'Петров',
  total: '15 500',
  items_list: 'Шампунь Pro 500мл × 2, Маска Hair × 1',
  tracking_number: 'RU123456789',
  delivery_date: '30 мая 2025',
  store_name: 'ProBeauty',
  email: 'ivan@example.com',
  reset_link: '#',
  rfq_id: 'RFQ-2025-042',
  name: 'Иван Петров',
  card_number: '123456',
  invite_link: 'https://hairshoppro.lv/auth/invite?token=example',
  site_url: 'https://hairshoppro.lv',
  note_block: '',
}

function renderTemplate(text: string, variables: string[]): string {
  let result = text
  for (const v of variables) {
    result = result.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), SAMPLE[v] ?? `[${v}]`)
  }
  return result
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as { to?: string }
    const to = body.to?.trim() ?? ''

    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const templates = await getTemplates()
    const template = templates.find((t) => t.id === id)
    if (!template) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const subject = renderTemplate(template.subject, template.variables)
    const html = renderTemplate(template.body, template.variables)

    await sendEmail(to, `[Тест] ${subject}`, html)

    return NextResponse.json({ ok: true })
  } catch (err) {
    logApiError("[send-test]", err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}




