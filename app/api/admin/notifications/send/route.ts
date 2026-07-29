import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['info', 'success', 'warning', 'promo'] as const
type AllowedType = typeof ALLOWED_TYPES[number]

const TYPE_COLOR: Record<AllowedType, string> = {
  info:    '#4f46e5',
  success: '#059669',
  warning: '#d97706',
  promo:   '#7c3aed',
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function buildHtml(title: string, message: string, type: AllowedType, link: string | null, siteUrl: string): string {
  const accentColor = TYPE_COLOR[type]
  const fullLink = link ? `${siteUrl}${link}` : null
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="border-left:4px solid ${accentColor};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:16px">
        <h2 style="margin:0 0 8px;font-size:16px;color:#111827">${escHtml(title)}</h2>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${escHtml(message)}</p>
      </div>
      ${fullLink ? `<a href="${escHtml(fullLink)}" style="display:inline-block;padding:10px 20px;background:${accentColor};color:#fff;border-radius:6px;font-size:14px;text-decoration:none">Open</a>` : ''}
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">You received this notification from the store.</p>
    </div>`
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const caller = await getServerUser()
    if (!caller || caller.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      userIds?: unknown
      title?: string
      message?: string
      type?: string
      link?: string
      channel?: string
    }

    const userIds = Array.isArray(body.userIds)
      ? (body.userIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const title   = body.title?.trim() ?? ''
    const message = body.message?.trim() ?? ''
    const type: AllowedType = (ALLOWED_TYPES as readonly string[]).includes(body.type ?? '')
      ? (body.type as AllowedType)
      : 'info'
    const channel = (['app', 'email', 'both'] as const).includes(body.channel as 'app' | 'email' | 'both')
      ? (body.channel as 'app' | 'email' | 'both')
      : 'app'
    const rawLink = typeof body.link === 'string' ? body.link.trim() : ''
    const link    = (rawLink && /^\/[^/]/.test(rawLink)) ? rawLink : null

    if (userIds.length === 0) return NextResponse.json({ error: 'no_recipients' },  { status: 400 })
    if (!title)               return NextResponse.json({ error: 'title_required' },  { status: 400 })
    if (!message)             return NextResponse.json({ error: 'message_required' }, { status: 400 })

    const now = new Date()
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title,
        message,
        link,
        channel,
        emailSent:    false,
        appDelivered: false,
        createdAt:    now,
      })),
    })

    let emailsSent   = 0
    let emailsFailed = 0

    if (channel === 'email' || channel === 'both') {
      const users = await prisma.user.findMany({
        where:  { id: { in: userIds } },
        select: { id: true, email: true },
      })
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      const html = buildHtml(title, message, type, link, siteUrl)

      for (const u of users) {
        try {
          await sendEmail(u.email, title, html)
          emailsSent++
        } catch {
          emailsFailed++
        }
      }
    }

    return NextResponse.json({ ok: true, created: userIds.length, emailsSent, emailsFailed })
  } catch (err) {
    console.error('[admin/notifications/send]', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
