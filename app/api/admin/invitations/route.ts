import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin, type ServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import {
  emailDeliveryInFlight,
  invitationBatchId,
  lockBatch,
  lockInvitationUsers,
} from '@/lib/invitation-dispatch'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
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
import { parseOffsetPagination } from '@/lib/pagination'

export const runtime = 'nodejs'
export const maxDuration = 60

const inviteUrlFor = (base: string, token: string) => `${base}/auth/invite?token=${token}`
const INVITATION_ISSUE_ACTIONS = ['invitation.created', 'invitation.replaced'] as const

const HOLDER_SORT_FIELDS = ['name', 'email', 'cardNumber'] as const
type HolderSortField = (typeof HOLDER_SORT_FIELDS)[number]

// GET: держатели карт (постранично) + статусы приглашений
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const sortParam = searchParams.get('sort')
    const sortField: HolderSortField = (HOLDER_SORT_FIELDS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as HolderSortField)
      : 'email'
    const sortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
    const contact = searchParams.get('contact')
    const invitation = searchParams.get('invitation')
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })

    const where: Record<string, unknown> = {
      cardNumber: { not: null },
      // Этот же признак используется разделом «Зарегистрированные клиенты».
      privacyAcknowledgedAt: null,
    }
    const and: Array<Record<string, unknown>> = []
    const hasRealEmail = {
      AND: [
        { email: { not: { endsWith: '@client.local' } } },
        { email: { not: { endsWith: '@deleted.invalid' } } },
      ],
    }
    const hasNoRealEmail = {
      OR: [
        { email: { endsWith: '@client.local' } },
        { email: { endsWith: '@deleted.invalid' } },
      ],
    }
    const hasPhone = { phone: { not: null }, NOT: { phone: '' } }
    const hasNoPhone = { OR: [{ phone: null }, { phone: '' }] }
    if (contact === 'emailOnly') and.push(hasRealEmail, hasNoPhone)
    if (contact === 'phoneOnly') and.push(hasNoRealEmail, hasPhone)
    if (contact === 'complete') and.push(hasRealEmail, hasPhone)
    if (contact === 'none') and.push(hasNoRealEmail, hasNoPhone)
    if (invitation === 'invited') and.push({
      invitationTokens: { some: {} },
    })
    if (invitation === 'notInvited') and.push({
      invitationTokens: { none: {} },
    })
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { cardNumber: { contains: search, mode: 'insensitive' } },
        ],
      })
    }
    if (and.length > 0) where.AND = and

    const orderBy =
      sortField === 'name' ? { name: sortDir } as const
      : sortField === 'cardNumber' ? { cardNumber: sortDir } as const
      : { email: sortDir } as const

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true, cardNumber: true },
        orderBy,
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ])

    const emails = rows.map((u) => u.email.toLowerCase())
    const invitations = await readInvitations(prisma, emails)
    const byEmail = new Map<string, (typeof invitations)[number]>()
    // readInvitations is newest-first; keep the current invitation on resends.
    for (const invitation of invitations) {
      if (!byEmail.has(invitation.email)) byEmail.set(invitation.email, invitation)
    }

    return NextResponse.json({
      total,
      holders: rows.map((u) => {
        const inv = byEmail.get(u.email.toLowerCase())
        const status = inv ? deriveStatus(inv) : 'none'
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          cardNumber: u.cardNumber,
          status,
          sentAt: inv?.sentAt ?? null,
          // Ссылку показываем только пока инвайт живой — админ может скопировать вручную
          inviteUrl: null,
        }
      }),
    })
  } catch (e) {
    logApiError("[admin/invitations GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST: отправить приглашения выбранным держателям карт.
// Не больше INVITE_BATCH_SIZE за запрос — массовую рассылку админка гонит
// порциями. Токены и события аудита сохраняются в одной транзакции ДО отправки
// писем: обрыв посреди порции не оставит клиентам мёртвых ссылок (худший
// случай — статус sent без письма, лечится повторной отправкой). Результат
// доставки фиксируется отдельно, после того как он стал известен.
export async function POST(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await req.json()) as { userIds?: string[]; language?: string }
    const userIds = body.userIds ?? []
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    }
    if (userIds.length > INVITE_BATCH_SIZE) {
      return NextResponse.json({ error: 'too_many', max: INVITE_BATCH_SIZE }, { status: 400 })
    }
    const batchId = invitationBatchId(req, actor.id, 'invitations-email')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })
    const language = resolveInviteLang(body.language)

    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        cardNumber: { not: null },
        AND: [
          { email: { not: { endsWith: '@client.local' } } },
          { email: { not: { endsWith: '@deleted.invalid' } } },
        ],
      },
      select: { id: true, name: true, email: true, cardNumber: true, platformRole: true, teamRole: true, superAdmin: true },
    }).then((rows) => rows.filter((u) => !isProtectedStaffAccount(u)))

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

    // 1. Токены и аудит в одной транзакции до писем. Advisory locks (батч и
    // каждый пользователь) сериализуют повторы и параллельные отправки; уровень
    // изоляции по умолчанию — appendServerAudit должен видеть свежую голову цепочки.
    const prepared = await prisma.$transaction(async (tx) => {
      await lockBatch(tx, batchId)
      const previous = await tx.auditLog.findMany({
        where: { requestId: batchId, action: { in: [...INVITATION_ISSUE_ACTIONS] } },
        select: { entityId: true },
      })
      if (previous.length > 0) return { kind: 'replay' as const, userIds: previous.map((row) => row.entityId) }

      await lockInvitationUsers(tx, records.map((r) => r.userId))
      const issued: NewInvitation[] = []
      const pending: string[] = []
      for (const record of records) {
        if (await emailDeliveryInFlight(tx, record.userId, now)) {
          pending.push(record.userId)
          continue
        }
        const replaced = await replaceInvitation(tx, record)
        await appendServerAudit(tx, req, actor, {
          action: replaced > 0 ? 'invitation.replaced' : 'invitation.created',
          entityType: 'user',
          entityId: record.userId,
          requestId: batchId,
          before: replaced > 0 ? { openInvitations: replaced } : null,
          after: { channel: 'email', language, expiresAt, batchSize: records.length },
        })
        issued.push(record)
      }
      return { kind: 'issued' as const, issued, pending }
    })

    if (prepared.kind === 'replay') {
      return NextResponse.json({ results: await replayEmailResults(batchId, prepared.userIds, users), replayed: true })
    }

    // 2. Отправка писем
    const sent: string[] = []
    const failed: NewInvitation[] = []
    const outcome = new Map<string, { status: 'sent' | 'error'; inviteUrl: string }>()
    for (const r of prepared.issued) {
      const user = users.find((u) => u.id === r.userId)!
      const inviteUrl = inviteUrlFor(base, r.token)
      const { subject, html } = buildInviteEmail(
        language,
        { name: user.name ?? '', cardNumber: r.cardNumber, inviteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )
      try {
        await sendEmail(user.email, subject, html)
        sent.push(r.userId)
        outcome.set(r.userId, { status: 'sent', inviteUrl })
      } catch (err) {
        logApiError('admin_invitations_email_failed', err)
        failed.push(r)
        outcome.set(r.userId, { status: 'error', inviteUrl })
      }
    }

    // 3. Результат доставки известен: неушедшие письма помечаем error (их токены
    // гасятся — findValid отвергает error), доставку и итог пишем после коммита токенов.
    if (prepared.issued.length > 0) {
      await recordEmailDelivery(req, actor, batchId, records.length, sent, failed, prepared.pending)
    }

    const results = users.map((user) => {
      const delivered = outcome.get(user.id)
      return delivered
        ? { userId: user.id, email: user.email, status: delivered.status, inviteUrl: delivered.inviteUrl }
        : { userId: user.id, email: user.email, status: 'pending' as const }
    })
    return NextResponse.json({ results })
  } catch (e) {
    logApiError("[admin/invitations POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

async function recordEmailDelivery(
  req: NextRequest,
  actor: ServerUser,
  batchId: string,
  batchSize: number,
  sent: string[],
  failed: NewInvitation[],
  pending: string[],
): Promise<void> {
  const failedUserIds = failed.map((r) => r.userId)
  try {
    await prisma.$transaction(async (tx) => {
      if (failed.length > 0) {
        await tx.invitationToken.updateMany({
          where: { tokenHash: { in: failed.map((r) => hashInviteToken(r.token)) }, status: 'sent' },
          data: { status: 'error' },
        })
      }
      await tx.invitationDelivery.createMany({
        data: [
          ...sent.map((userId) => ({ userId, channel: 'email', status: 'sent' })),
          ...failedUserIds.map((userId) => ({ userId, channel: 'email', status: 'error' })),
        ],
      })
      await appendServerAudit(tx, req, actor, {
        action: 'invitation.delivery_recorded',
        entityType: 'invitation_batch',
        entityId: batchId,
        requestId: batchId,
        after: { channel: 'email', batchSize, sent, failed: failedUserIds, pending },
      })
    })
  } catch (error) {
    // The emails already left (or failed); keep the response truthful and at
    // least retire the tokens of undelivered emails.
    logApiError('admin_invitations_delivery_record_failed', error)
    if (failed.length > 0) {
      await prisma.invitationToken.updateMany({
        where: { tokenHash: { in: failed.map((r) => hashInviteToken(r.token)) }, status: 'sent' },
        data: { status: 'error' },
      }).catch((retireError: unknown) => logApiError('admin_invitations_token_retire_failed', retireError))
    }
  }
}

/** Outcome of an already processed batch, without new tokens, emails or events. */
async function replayEmailResults(
  batchId: string,
  issuedUserIds: string[],
  users: Array<{ id: string; email: string }>,
): Promise<Array<{ userId: string; email: string; status: 'sent' | 'error' | 'pending' }>> {
  const delivery = await prisma.auditLog.findFirst({
    where: { requestId: batchId, action: 'invitation.delivery_recorded' },
    select: { after: true },
  })
  const recorded = (delivery?.after ?? {}) as { sent?: string[]; failed?: string[] }
  const issued = new Set(issuedUserIds)
  return users
    .filter((user) => issued.has(user.id))
    .map((user) => ({
      userId: user.id,
      email: user.email,
      status: recorded.sent?.includes(user.id) ? 'sent' : recorded.failed?.includes(user.id) ? 'error' : 'pending',
    }))
}
