import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readInvitations,
  writeInvitations,
  deriveStatus,
  newInviteToken,
  INVITE_TTL_DAYS,
  type ProInvitation,
  type InviteLang,
} from '@/lib/invitations'
import { buildInviteEmail } from '@/lib/invitation-emails'

export const runtime = 'nodejs'

function baseUrl(req: NextRequest): string {
  const host = req.headers.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`
}

const inviteUrlFor = (base: string, token: string) => `${base}/auth/invite?token=${token}`

// GET: держатели карт + статусы приглашений
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const [holders, invitations] = await Promise.all([
      prisma.user.findMany({
        where: { cardNumber: { not: null } },
        select: { id: true, name: true, email: true, cardNumber: true },
        orderBy: { email: 'asc' },
      }),
      readInvitations(prisma),
    ])
    const byEmail = new Map(invitations.map((i) => [i.email, i]))
    const base = baseUrl(req)

    return NextResponse.json({
      holders: holders.map((u) => {
        const inv = byEmail.get(u.email.toLowerCase())
        const status = inv ? deriveStatus(inv) : 'none'
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          cardNumber: u.cardNumber,
          status,
          sentAt: inv?.sentAt ?? null,
          // Ссылку показываем только пока инвайт живой — админ может скопировать вручную
          inviteUrl: inv && status === 'sent' ? inviteUrlFor(base, inv.token) : null,
        }
      }),
    })
  } catch (e) {
    console.error('[admin/invitations GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST: отправить приглашения выбранным держателям карт
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { userIds?: string[]; language?: InviteLang }
    const userIds = body.userIds ?? []
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    }
    const language: InviteLang = (['ru', 'en', 'lv'] as const).includes(body.language as InviteLang)
      ? (body.language as InviteLang)
      : 'ru'

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, cardNumber: { not: null } },
      select: { id: true, name: true, email: true, cardNumber: true },
    })

    const templates = await getTemplates()
    const tpl = templates.find((t) => t.id === `pro-invite-${language}`)
    const base = baseUrl(req)
    const invitations = await readInvitations(prisma)
    const results: Array<{ userId: string; email: string; status: 'sent' | 'error'; inviteUrl: string }> = []

    for (const u of users) {
      const token = newInviteToken()
      const now = new Date()
      const inviteUrl = inviteUrlFor(base, token)
      const { subject, html } = buildInviteEmail(
        language,
        { name: u.name ?? '', cardNumber: u.cardNumber!, inviteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )

      let status: 'sent' | 'error' = 'sent'
      try {
        await sendEmail(u.email, subject, html)
      } catch (err) {
        console.error('[admin/invitations POST] sendEmail failed for', u.email, err)
        status = 'error'
      }

      const record: ProInvitation = {
        userId: u.id,
        email: u.email.toLowerCase(),
        cardNumber: u.cardNumber!,
        token,
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        acceptedAt: null,
        status,
        language,
      }
      // Повторная отправка заменяет старую запись по email
      const idx = invitations.findIndex((i) => i.email === record.email)
      if (idx >= 0) invitations[idx] = record
      else invitations.push(record)

      results.push({ userId: u.id, email: u.email, status, inviteUrl })
    }

    await writeInvitations(prisma, invitations)
    return NextResponse.json({ results })
  } catch (e) {
    console.error('[admin/invitations POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
