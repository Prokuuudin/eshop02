import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml as escHtml } from '@/lib/escape-html'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'
const MAX_RECIPIENTS = 500
const TITLE_MAX = 150
const MESSAGE_MAX = 5000
const EMAIL_CONCURRENCY = 5
const ALLOWED_TYPES = ['info', 'success', 'warning', 'promo'] as const
type AllowedType = typeof ALLOWED_TYPES[number]
type Channel = 'app' | 'email' | 'both'
const TYPE_COLOR: Record<AllowedType, string> = { info: '#4f46e5', success: '#059669', warning: '#d97706', promo: '#7c3aed' }

function isSafeInternalPath(value: string): boolean {
  return /^\/(?!\/)/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value)
}
function buildHtml(title: string, message: string, type: AllowedType, link: string | null, siteUrl: string): string {
  const accent = TYPE_COLOR[type]
  const fullLink = link ? `${siteUrl.replace(/\/$/u, '')}${link}` : null
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="border-left:4px solid ${accent};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:16px"><h2>${escHtml(title)}</h2><p>${escHtml(message)}</p></div>${fullLink ? `<a href="${escHtml(fullLink)}">Open</a>` : ''}</div>`
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const caller = await requireAdminPermission('marketing.manage')
    if (!caller || caller instanceof NextResponse || caller.platformRole !== 'admin') return caller instanceof NextResponse ? caller : NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null) as { userIds?: unknown; title?: unknown; message?: unknown; type?: unknown; link?: unknown; channel?: unknown } | null
    const userIds = [...new Set(Array.isArray(body?.userIds) ? body.userIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [])]
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const type: AllowedType = ALLOWED_TYPES.includes(body?.type as AllowedType) ? body?.type as AllowedType : 'info'
    const channel: Channel = ['app', 'email', 'both'].includes(String(body?.channel)) ? body?.channel as Channel : 'app'
    const rawLink = typeof body?.link === 'string' ? body.link.trim() : ''
    if (!userIds.length) return NextResponse.json({ error: 'no_recipients' }, { status: 400 })
    if (userIds.length > MAX_RECIPIENTS) return NextResponse.json({ error: 'too_many_recipients', max: MAX_RECIPIENTS }, { status: 400 })
    if (!title || title.length > TITLE_MAX) return NextResponse.json({ error: !title ? 'title_required' : 'title_too_long', max: TITLE_MAX }, { status: 400 })
    if (!message || message.length > MESSAGE_MAX) return NextResponse.json({ error: !message ? 'message_required' : 'message_too_long', max: MESSAGE_MAX }, { status: 400 })
    if (rawLink && !isSafeInternalPath(rawLink)) return NextResponse.json({ error: 'invalid_link' }, { status: 400 })
    const link = rawLink || null
    const users = await prisma.user.findMany({ where: { id: { in: userIds }, platformRole: 'customer' }, select: { id: true, email: true, notificationsSubscribed: true, marketingConsent: true } })
    const subscribed = users.filter((u) => u.notificationsSubscribed)
    const consented = type === 'promo' ? subscribed.filter((u) => u.marketingConsent) : subscribed
    const wantsApp = channel === 'app' || channel === 'both'
    const wantsEmail = channel === 'email' || channel === 'both'
    const now = new Date()
    if (wantsApp && consented.length) await prisma.userNotification.createMany({ data: consented.map((u) => ({ userId: u.id, type, title, message, link, channel: channel === 'both' ? 'both' : 'app', createdAt: now })) })
    let emailsSent = 0; let emailsFailed = 0; let invalidEmailSkipped = 0
    if (wantsEmail) {
      const deliverable = consented.filter((u) => { const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(u.email); if (!valid) invalidEmailSkipped++; return valid })
      const html = buildHtml(title, message, type, link, process.env.NEXT_PUBLIC_SITE_URL ?? '')
      for (let i = 0; i < deliverable.length; i += EMAIL_CONCURRENCY) {
        const results = await Promise.allSettled(deliverable.slice(i, i + EMAIL_CONCURRENCY).map((u) => sendEmail(u.email, title, html)))
        emailsSent += results.filter((r) => r.status === 'fulfilled').length
        emailsFailed += results.filter((r) => r.status === 'rejected').length
      }
    }
    const result = { selected: userIds.length, appDelivered: wantsApp ? consented.length : 0, emailsSent, emailsFailed,
      preferencesSkipped: users.filter((u) => !u.notificationsSubscribed).length,
      marketingConsentSkipped: wantsEmail && type === 'promo' ? subscribed.filter((u) => !u.marketingConsent).length : 0,
      invalidEmailSkipped, ineligibleSkipped: userIds.length - users.length }
    await prisma.$transaction(async (tx) => appendServerAudit(tx, req, caller, { action: 'notification.delivery_completed', entityType: 'notification_batch', entityId: `batch:${now.toISOString()}`, after: { ...result, title, type, link, channel } }))
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logApiError('[admin/notifications/send]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
