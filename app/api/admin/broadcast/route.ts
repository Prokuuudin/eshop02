import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 500

type Recipient = { email: string; firstName: string; lastName: string }

function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function wrapHtml(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      <div style="font-size:15px;line-height:1.7">${escaped}</div>
      <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb"/>
      <p style="font-size:12px;color:#9ca3af;margin:0">
        Чтобы отписаться от рассылки, ответьте на это письмо с пометкой «Отписаться». / To unsubscribe, reply to this email with &quot;Unsubscribe&quot;. / Lai atteiktos no jaunumiem, atbildiet uz šo e-pastu ar norādi &quot;Atteikt&quot;.
      </p>
    </div>`
}

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as {
      recipients?: Recipient[]
      subject?: string
      body?: string
    }

    const recipients = (Array.isArray(body.recipients) ? body.recipients : []).filter(
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
    const failedEmails: string[] = []

    for (const recipient of recipients) {
      const vars: Record<string, string> = {
        first_name: recipient.firstName,
        last_name: recipient.lastName,
        email: recipient.email,
      }
      const personalSubject = renderVars(subject, vars)
      const personalHtml = wrapHtml(renderVars(bodyText, vars))

      try {
        await sendEmail(recipient.email, personalSubject, personalHtml)
        sent++
      } catch {
        failed++
        if (failedEmails.length < 10) failedEmails.push(recipient.email)
      }
    }

    return NextResponse.json({ ok: true, sent, failed, failedEmails })
  } catch (err) {
    console.error('[broadcast]', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
