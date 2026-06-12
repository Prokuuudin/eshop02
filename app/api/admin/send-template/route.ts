import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  let body: { templateId: string; to: string; variables: Record<string, string> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { templateId, to, variables } = body
  if (!templateId || !to) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  const templates = await getTemplates()
  const tpl = templates.find((t) => t.id === templateId)
  if (!tpl) {
    return NextResponse.json({ ok: false, code: 'template_not_found' }, { status: 404 })
  }

  const subject = interpolate(tpl.subject, variables ?? {})
  const html = interpolate(tpl.body, variables ?? {})

  try {
    await sendEmail(to, subject, html)
  } catch (err) {
    console.error('[send-template] error:', err)
    return NextResponse.json({ ok: false, code: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, templateId, to })
}
