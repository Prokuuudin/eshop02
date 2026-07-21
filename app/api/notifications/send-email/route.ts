import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const TYPE_COLOR: Record<string, string> = {
  info:    '#4f46e5',
  success: '#059669',
  warning: '#d97706',
  promo:   '#7c3aed',
}

const ALLOWED_TYPES = ['info', 'success', 'warning', 'promo'] as const
type AllowedType = typeof ALLOWED_TYPES[number]

const EMAIL_NOTIFICATION_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 10 }
const MAX_TITLE_LENGTH = 160
const MAX_MESSAGE_LENGTH = 5000
const MAX_LINK_LENGTH = 500

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const limit = await checkRateLimit(`notification-email:user:${user.id}`, EMAIL_NOTIFICATION_LIMIT)
    if (limit.limited) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
      return NextResponse.json({ error: 'rate_limited', resetAt: limit.resetAt }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }

    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 16_384) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    const body = await req.json() as {
      title?: string
      message?: string
      type?: string
      link?: string
    }

    const title = body.title?.trim() ?? ''
    const message = body.message?.trim() ?? ''
    if (!title || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (title.length > MAX_TITLE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }
    if (typeof body.link === 'string' && body.link.length > MAX_LINK_LENGTH) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }

    const type: AllowedType = (ALLOWED_TYPES as readonly string[]).includes(body.type ?? '')
      ? (body.type as AllowedType)
      : 'info'
    const accentColor = TYPE_COLOR[type]
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const rawLink = typeof body.link === 'string' ? body.link.trim() : ''
    const link = (rawLink && /^\/[^/]/.test(rawLink)) ? `${siteUrl}${rawLink}` : null

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="border-left:4px solid ${accentColor};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:16px">
          <h2 style="margin:0 0 8px;font-size:16px;color:#111827">${escHtml(title)}</h2>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${escHtml(message)}</p>
        </div>
        ${link ? `<a href="${escHtml(link)}" style="display:inline-block;padding:10px 20px;background:${accentColor};color:#fff;border-radius:6px;font-size:14px;text-decoration:none">Open</a>` : ''}
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">You received this because you subscribed to email notifications.</p>
      </div>`

    await sendEmail(user.email, title, html)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notifications/send-email]', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
