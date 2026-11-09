import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdmin } from '@/lib/server-auth'
import { getTemplates } from '@/lib/email-templates-server-store'
import { sendEmail } from '@/lib/mailer'
import { invitationBatchId } from '@/lib/invitation-dispatch'
import { prepareAuditedDelivery, recordAuditedDelivery } from '@/lib/audited-delivery'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEST_EVENTS = { prepared: 'email_template.test_prepared', recorded: 'email_template.test_recorded' }

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
  registration_link: 'https://hairshoppro.lv/auth/register',
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
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = (await request.json()) as { to?: string }
    const to = body.to?.trim() ?? ''

    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    const batchId = invitationBatchId(request, actor.id, 'email-template-test')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })

    const templates = await getTemplates()
    const template = templates.find((t) => t.id === id)
    if (!template) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const subject = renderTemplate(template.subject, template.variables)
    const html = renderTemplate(template.body, template.variables)

    // Audit before SMTP: template ID and counts only — no address, subject,
    // body or substituted values. A technical retry replays a delivered test
    // email; a recorded failure may retry with the same key.
    const target = { entityType: 'email_template', entityId: template.id }
    const claim = await prepareAuditedDelivery({
      request, actor, batchId, actions: TEST_EVENTS, target,
      after: {
        channel: 'email', variables: template.variables.length,
        recipientIsActor: to.toLowerCase() === actor.email.toLowerCase(),
      },
      retryable: (result) => (result as { status?: string } | null)?.status === 'failed',
    })
    if (claim.kind === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 })
    if (claim.kind === 'replay') return NextResponse.json({ ok: true, replayed: true })

    try {
      await sendEmail(to, `[Тест] ${subject}`, html)
    } catch (error) {
      await recordAuditedDelivery({ request, actor, batchId, actions: TEST_EVENTS, target, result: { channel: 'email', status: 'failed' } })
      throw error
    }
    await recordAuditedDelivery({ request, actor, batchId, actions: TEST_EVENTS, target, result: { channel: 'email', status: 'sent' } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    logApiError("[send-test]", err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}



