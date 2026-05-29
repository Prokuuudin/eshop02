import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

type Lang = 'ru' | 'en' | 'lv'

const FIRST_LOGIN_PASSWORD =
  process.env.NEXT_PUBLIC_FIRST_LOGIN_PASSWORD || 'Welcome1!'

const OFFICE_PHONE = '+371 27067730'
const OFFICE_EMAIL = 'office@miksplus.eu'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://miksplus.eu'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

function buildNoteBlock(note: string, lang: Lang): string {
  const label = lang === 'ru' ? 'Комментарий' : lang === 'en' ? 'Comment' : 'Komentārs'
  return `<div style="background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#9a3412;line-height:1.6">
    <p style="margin:0 0 4px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#c2410c">${label}</p>
    <p style="margin:0">${escapeHtml(note)}</p>
  </div>`
}

// Fallback HTML builders (used if template not found in JSON)
const FALLBACK_SUBJECTS: Record<string, Record<Lang, string>> = {
  approval: {
    ru: 'Добро пожаловать! Ваша карта клиента готова',
    en: 'Welcome! Your client card is ready',
    lv: 'Laipni lūdzam! Jūsu klienta karte ir gatava',
  },
  rejection: {
    ru: 'О вашей заявке на карту клиента',
    en: 'About your client card application',
    lv: 'Par jūsu klienta kartes pieteikumu',
  },
}

function buildFallbackApproval(name: string, cardNumber: string, lang: Lang): string {
  const safeName = escapeHtml(name)
  const safeCard = escapeHtml(cardNumber)
  const safePass = escapeHtml(FIRST_LOGIN_PASSWORD)
  return interpolate(
    `<p>Dear {{name}},</p><p>Card: {{card_number}}</p><p>Password: {{password}}</p><p><a href="{{site_url}}/auth/register">Register</a></p>`,
    { name: safeName, card_number: safeCard, password: safePass, site_url: SITE_URL }
  )
}

function buildFallbackRejection(name: string, lang: Lang, note?: string): string {
  const safeName = escapeHtml(name)
  const noteBlock = note ? buildNoteBlock(note, lang) : ''
  return `<p>${safeName},</p><p>Application rejected.</p>${noteBlock}<p>${OFFICE_PHONE} / ${OFFICE_EMAIL}</p>`
}

type ApprovePayload = { action: 'approve'; email: string; name: string; cardNumber: string; language?: Lang }
type RejectPayload = { action: 'reject'; email: string; name: string; note?: string; language?: Lang }
type Payload = ApprovePayload | RejectPayload

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { action, email, name } = payload
  if (!action || !email || !name) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  const lang: Lang = payload.language ?? 'ru'

  try {
    const templates = await getTemplates()
    const findTemplate = (id: string) => templates.find((t) => t.id === id)

    if (action === 'approve') {
      const { cardNumber } = payload as ApprovePayload
      if (!cardNumber) return NextResponse.json({ ok: false, code: 'missing_card' }, { status: 422 })

      const tpl = findTemplate(`access-request-approved-${lang}`)
      const subject = tpl?.subject ?? FALLBACK_SUBJECTS.approval[lang]
      const html = tpl
        ? interpolate(tpl.body, {
            name: escapeHtml(name),
            card_number: escapeHtml(cardNumber),
            password: escapeHtml(FIRST_LOGIN_PASSWORD),
            site_url: SITE_URL,
          })
        : buildFallbackApproval(name, cardNumber, lang)

      await sendEmail(email, subject, html)

    } else if (action === 'reject') {
      const { note } = payload as RejectPayload
      const tpl = findTemplate(`access-request-rejected-${lang}`)
      const subject = tpl?.subject ?? FALLBACK_SUBJECTS.rejection[lang]
      const html = tpl
        ? interpolate(tpl.body, {
            name: escapeHtml(name),
            note_block: note ? buildNoteBlock(note, lang) : '',
          })
        : buildFallbackRejection(name, lang, note)

      await sendEmail(email, subject, html)

    } else {
      return NextResponse.json({ ok: false, code: 'unknown_action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[card-request] sendEmail error:', err)
    return NextResponse.json({ ok: false, code: 'email_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
