import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readInvitations,
  deriveStatus,
  newInviteToken,
  hashInviteToken,
  replaceInvitation,
  resolveInviteLang,
  INVITE_TTL_DAYS,
  INVITE_BATCH_SIZE,
  type NewInvitation,
} from '@/lib/invitations'
import { buildInviteEmail, pickInviteTemplate } from '@/lib/invitation-emails'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    const byEmail = new Map<string, (typeof invitations)[number]>()
    // readInvitations is newest-first; keep the current invitation on resends.
    for (const invitation of invitations) {
      if (!byEmail.has(invitation.email)) byEmail.set(invitation.email, invitation)
    }
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
          inviteUrl: null,
        }
      }),
    })
  } catch (e) {
    console.error('[admin/invitations GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST: отправить приглашения выбранным держателям карт.
// Не больше INVITE_BATCH_SIZE за запрос — массовую рассылку админка гонит
// порциями. Токены сохраняются в БД ДО отправки писем: обрыв посреди порции
// не оставит клиентам мёртвых ссылок (худший случай — статус sent без письма,
// лечится повторной отправкой).
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { userIds?: string[]; language?: string }
    const userIds = body.userIds ?? []
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    }
    if (userIds.length > INVITE_BATCH_SIZE) {
      return NextResponse.json({ error: 'too_many', max: INVITE_BATCH_SIZE }, { status: 400 })
    }
    const language = resolveInviteLang(body.language)

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, cardNumber: { not: null } },
      select: { id: true, name: true, email: true, cardNumber: true },
    })

    const templates = await getTemplates()
    // Базовый pro-invite трёхъязычный; языковой вариант — опциональный override
    const tpl = pickInviteTemplate(templates, language)
    const base = getSiteUrl()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const records: NewInvitation[] = users.map((u) => ({
      userId: u.id,
      email: u.email.toLowerCase(),
      cardNumber: u.cardNumber!,
      token: newInviteToken(),
      expiresAt,
      language,
    }))

    // 1. Токены в БД до писем; serializable — параллельные отправки не теряют записи
    await prisma.$transaction(
      async (tx) => {
        for (const r of records) await replaceInvitation(tx, r)
      },
      { isolationLevel: 'Serializable' }
    )

    // 2. Отправка писем
    const failedTokens: string[] = []
    const results: Array<{ userId: string; email: string; status: 'sent' | 'error'; inviteUrl: string }> = []
    for (const r of records) {
      const user = users.find((u) => u.id === r.userId)!
      const inviteUrl = inviteUrlFor(base, r.token)
      const { subject, html } = buildInviteEmail(
        language,
        { name: user.name ?? '', cardNumber: r.cardNumber, inviteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )
      let status: 'sent' | 'error' = 'sent'
      try {
        await sendEmail(user.email, subject, html)
      } catch (err) {
        console.error('[admin/invitations POST] sendEmail failed for', user.email, err)
        status = 'error'
        failedTokens.push(r.token)
      }
      results.push({ userId: r.userId, email: user.email, status, inviteUrl })
    }

    // 3. Неушедшие письма помечаем error — их токены гасятся (findValid отвергает error)
    if (failedTokens.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          await tx.invitationToken.updateMany({
            where: { tokenHash: { in: failedTokens.map(hashInviteToken) }, status: 'sent' },
            data: { status: 'error' },
          })
        },
        { isolationLevel: 'Serializable' }
      )
    }

    return NextResponse.json({ results })
  } catch (e) {
    console.error('[admin/invitations POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
