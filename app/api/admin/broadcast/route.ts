import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdmin } from "@/lib/server-auth"
import { sendEmail } from '@/lib/mailer'
import { getSiteUrl } from '@/lib/site-url'
import { getMarketingOptedOutSet, marketingUnsubUrl } from '@/lib/newsletter-store'
import { CUSTOMER_SEGMENTS, getCustomerRecipients, type CustomerSegment } from '@/lib/admin/customer-segments'
import { invitationBatchId } from '@/lib/invitation-dispatch'
import { prepareAuditedDelivery, recordAuditedDelivery } from '@/lib/audited-delivery'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 500
const BROADCAST_EVENTS = { prepared: 'broadcast.prepared', recorded: 'broadcast.delivery_recorded' }
type BroadcastResult = { channel: 'email'; sent: number; failed: number; skipped: number }

type Recipient = { email: string; firstName: string; lastName: string }

function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapHtml(content: string, unsubUrl: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  const href = escAttr(unsubUrl)
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      <div style="font-size:15px;line-height:1.7">${escaped}</div>
      <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb"/>
      <p style="font-size:12px;color:#9ca3af;margin:0">
        <a href="${href}" style="color:#6b7280">Отписаться от рассылки</a> / <a href="${href}" style="color:#6b7280">Unsubscribe</a> / <a href="${href}" style="color:#6b7280">Atteikties no jaunumiem</a>
      </p>
    </div>`
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as {
      recipients?: Recipient[]
      audience?: { segment?: CustomerSegment }
      subject?: string
      body?: string
    }
    const batchId = invitationBatchId(request, actor.id, 'broadcast')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })

    const requestedSegment = body.audience?.segment
    if (requestedSegment && !CUSTOMER_SEGMENTS.includes(requestedSegment)) {
      return NextResponse.json({ error: 'invalid_segment' }, { status: 400 })
    }
    const serverRecipients = body.audience
      ? await getCustomerRecipients(requestedSegment, MAX_RECIPIENTS + 1)
      : (Array.isArray(body.recipients) ? body.recipients : [])
    const recipients = serverRecipients.filter(
      (r) => r.email && EMAIL_RE.test(r.email)
    )
    const subject = body.subject?.trim() ?? ''
    const bodyText = body.body?.trim() ?? ''

    if (!subject)           return NextResponse.json({ error: 'subject_required' }, { status: 400 })
    if (!bodyText)          return NextResponse.json({ error: 'body_required' },    { status: 400 })
    if (recipients.length === 0) return NextResponse.json({ error: 'no_recipients' }, { status: 400 })
    if (recipients.length > MAX_RECIPIENTS)
      return NextResponse.json({ error: 'too_many_recipients', max: MAX_RECIPIENTS }, { status: 400 })

    let sent = 0
    let failed = 0
    let skipped = 0
    const failedEmails: string[] = []
    const baseUrl = getSiteUrl()

    // Honour prior opt-outs — never mail an address that unsubscribed (GDPR Art. 7(3)).
    const optedOut = await getMarketingOptedOutSet(recipients.map((r) => r.email))
    const optedOutCount = recipients.filter((r) => optedOut.has(r.email.toLowerCase())).length

    // Audit the send before SMTP (counts only — no addresses, subject or body).
    // A technical retry with the same Idempotency-Key replays the recorded
    // outcome; it only sends again when nothing was delivered.
    const target = { entityType: 'broadcast', entityId: batchId }
    const claim = await prepareAuditedDelivery({
      request, actor, batchId, actions: BROADCAST_EVENTS, target,
      after: {
        channel: 'email',
        audience: body.audience ? 'segment' : 'manual',
        segment: body.audience ? (requestedSegment ?? 'all') : null,
        recipients: recipients.length,
        optedOut: optedOutCount,
      },
      retryable: (result) => (result as BroadcastResult | null)?.sent === 0,
    })
    if (claim.kind === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 })
    if (claim.kind === 'replay') {
      const result = claim.result as BroadcastResult
      return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed, skipped: result.skipped, failedEmails: [], replayed: true })
    }

    for (const recipient of recipients) {
      if (optedOut.has(recipient.email.toLowerCase())) {
        skipped++
        continue
      }

      const vars: Record<string, string> = {
        first_name: recipient.firstName,
        last_name: recipient.lastName,
        email: recipient.email,
      }
      const unsubUrl = marketingUnsubUrl(recipient.email, baseUrl)
      const personalSubject = renderVars(subject, vars)
      const personalHtml = wrapHtml(renderVars(bodyText, vars), unsubUrl)

      try {
        await sendEmail(recipient.email, personalSubject, personalHtml, { listUnsubscribeUrl: unsubUrl })
        sent++
      } catch {
        failed++
        if (failedEmails.length < 10) failedEmails.push(recipient.email)
      }
    }

    await recordAuditedDelivery({
      request, actor, batchId, actions: BROADCAST_EVENTS, target,
      result: { channel: 'email', sent, failed, skipped } satisfies BroadcastResult,
    })

    return NextResponse.json({ ok: true, sent, failed, skipped, failedEmails })
  } catch (err) {
    logApiError("[broadcast]", err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}




