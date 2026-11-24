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
import { getMarketingSuppressions, sendMarketingEmail, suppressedUserIds } from '@/lib/marketing-suppression'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readInvitations,
  deriveStatus,
  newInviteToken,
  hashInviteToken,
  replaceInvitation,
  resolveInviteLang,
  INVITE_TTL_DAYS,
  EMAIL_INVITE_BATCH_SIZE,
  type NewInvitation,
} from '@/lib/invitations'
import { buildInviteEmail, pickInviteTemplate } from '@/lib/invitation-emails'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'
import { getSiteUrl } from '@/lib/site-url'
import { parseOffsetPagination } from '@/lib/pagination'
import { activeCardNumberFilter, assertCardsAssignable, getRevokedCardPolicy, isRevokedCardPolicyError } from '@/lib/revoked-card-policy'

export const runtime = 'nodejs'
export const maxDuration = 60

const inviteUrlFor = (base: string, token: string) => `${base}/auth/invite?token=${token}`
const INVITATION_ISSUE_ACTIONS = ['invitation.created', 'invitation.replaced'] as const
// Every client costs ~7 sequential round-trips inside the token transaction
// (locks, token replace, chained audit). Neon (us-east-1) is ~100 ms away from
// the EU host, so the Prisma default of 5 s rolled whole batches back.
const TOKEN_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

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
    const mailing = searchParams.get('mailing')
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })
    const revokedCardPolicy = await getRevokedCardPolicy()

    const where: Record<string, unknown> = {
      cardNumber: activeCardNumberFilter(revokedCardPolicy),
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
    // «Рассылки запрещены»: список запретов по нормализованному email (lib/marketing-suppression).
    if (mailing === 'suppressed') and.push({ id: { in: await suppressedUserIds() } })
    if (mailing === 'allowed') and.push({ id: { notIn: await suppressedUserIds() } })
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
    const [invitations, suppressions] = await Promise.all([
      readInvitations(prisma, emails),
      getMarketingSuppressions(rows.map((u) => u.email)),
    ])
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
          marketingSuppressed: suppressions.has(u.email.trim().toLowerCase()),
          // Ссылку показываем только пока инвайт живой — админ может скопировать вручную
          inviteUrl: null,
        }
      }),
    })
  } catch (e) {
    if (isRevokedCardPolicyError(e)) {
      return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
    }
    logApiError("[admin/invitations GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST: отправить приглашения выбранным держателям карт.
// Не больше EMAIL_INVITE_BATCH_SIZE за запрос — массовую рассылку админка гонит
// порциями. Токены и события аудита сохраняются в одной транзакции ДО отправки
// писем: обрыв посреди порции не оставит клиентам мёртвых ссылок (худший
// случай — статус sent без письма, лечится повторной отправкой). Результат
// доставки фиксируется отдельно, после того как он стал известен.
export async function POST(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await req.json()) as { userIds?: string[]; language?: string; skipInvited?: boolean }
    const userIds = body.userIds ?? []
    // Bulk sends pass skipInvited so a repeat never re-mails a client who already
    // has a live or accepted invitation; the per-row resend keeps replacing it.
    const skipInvited = body.skipInvited === true
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    }
    if (userIds.length > EMAIL_INVITE_BATCH_SIZE) {
      return NextResponse.json({ error: 'too_many', max: EMAIL_INVITE_BATCH_SIZE }, { status: 400 })
    }
    const batchId = invitationBatchId(req, actor.id, 'invitations-email')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })
    const language = resolveInviteLang(body.language)
    const revokedCardPolicy = await getRevokedCardPolicy()

    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        cardNumber: activeCardNumberFilter(revokedCardPolicy),
        AND: [
          { email: { not: { endsWith: '@client.local' } } },
          { email: { not: { endsWith: '@deleted.invalid' } } },
        ],
      },
      select: { id: true, name: true, email: true, cardNumber: true, platformRole: true, teamRole: true, superAdmin: true },
    }).then((rows) => rows.filter((u) => !isProtectedStaffAccount(u)))
    // Клиенты с запретом рассылок не получают ни новых, ни повторных приглашений:
    // токен им не выпускается. Перед самой отправкой sendMarketingEmail проверяет ещё раз.
    const suppressed = new Set(await suppressedUserIds(prisma, users.map((u) => u.id)))
    const invitable = users.filter((u) => !suppressed.has(u.id))

    const templates = await getTemplates()
    // Базовый pro-invite трёхъязычный; языковой вариант — опциональный override
    const tpl = pickInviteTemplate(templates, language)
    const bonus = await getBonusProgramConfig()
    const base = getSiteUrl()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const records: NewInvitation[] = invitable.map((u) => ({
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
      await assertCardsAssignable(records.map((record) => record.cardNumber), tx)
      await lockBatch(tx, batchId)
      const previous = await tx.auditLog.findMany({
        where: { requestId: batchId, action: { in: [...INVITATION_ISSUE_ACTIONS] } },
        select: { entityId: true },
      })
      if (previous.length > 0) return { kind: 'replay' as const, userIds: previous.map((row) => row.entityId) }

      await lockInvitationUsers(tx, records.map((r) => r.userId))
      // Read under the per-user locks, so a concurrent batch cannot slip past it.
      const alreadyInvited = skipInvited && records.length > 0
        ? new Set((await tx.invitationToken.findMany({
            where: {
              userId: { in: records.map((r) => r.userId) },
              OR: [{ status: 'accepted' }, { status: 'sent', expiresAt: { gt: now } }],
            },
            select: { userId: true },
          })).map((t) => t.userId))
        : new Set<string>()
      const issued: NewInvitation[] = []
      const pending: string[] = []
      const skipped: string[] = []
      for (const record of records) {
        if (alreadyInvited.has(record.userId)) {
          skipped.push(record.userId)
          continue
        }
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
      return { kind: 'issued' as const, issued, pending, skipped }
    }, TOKEN_TRANSACTION_OPTIONS)

    if (prepared.kind === 'replay') {
      return NextResponse.json({ results: await replayEmailResults(batchId, prepared.userIds, users), replayed: true })
    }

    // 2. Отправка писем
    const sent: string[] = []
    const failed: NewInvitation[] = []
    // A block set while this batch was being prepared: the token is retired like a failed send.
    const blockedAtSend: NewInvitation[] = []
    const outcome = new Map<string, { status: 'sent' | 'error'; inviteUrl: string }>()
    for (const r of prepared.issued) {
      const user = users.find((u) => u.id === r.userId)!
      const inviteUrl = inviteUrlFor(base, r.token)
      const { subject, html } = buildInviteEmail(
        language,
        { name: user.name ?? '', cardNumber: r.cardNumber, inviteUrl, bonus },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )
      try {
        if (await sendMarketingEmail(user.email, subject, html, { category: 'invitation', userId: r.userId }) === 'suppressed') {
          blockedAtSend.push(r)
          suppressed.add(r.userId)
          continue
        }
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
    if (prepared.issued.length > 0 || suppressed.size > 0) {
      await recordEmailDelivery(req, actor, batchId, records.length, sent, failed, prepared.pending, prepared.skipped, [...suppressed], blockedAtSend)
    }

    const skipped = new Set(prepared.skipped)
    const results = users.map((user) => {
      const delivered = outcome.get(user.id)
      if (delivered) return { userId: user.id, email: user.email, status: delivered.status, inviteUrl: delivered.inviteUrl }
      if (suppressed.has(user.id)) return { userId: user.id, email: user.email, status: 'suppressed' as const }
      return { userId: user.id, email: user.email, status: skipped.has(user.id) ? 'skipped' as const : 'pending' as const }
    })
    return NextResponse.json({ results, suppressed: suppressed.size })
  } catch (e) {
    if (isRevokedCardPolicyError(e)) {
      return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
    }
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
  skipped: string[],
  suppressed: string[] = [],
  blockedAtSend: NewInvitation[] = [],
): Promise<void> {
  const failedUserIds = failed.map((r) => r.userId)
  // Undelivered tokens (SMTP failure or a block found at send time) must not stay usable.
  const retired = [...failed, ...blockedAtSend]
  try {
    await prisma.$transaction(async (tx) => {
      if (retired.length > 0) {
        await tx.invitationToken.updateMany({
          where: { tokenHash: { in: retired.map((r) => hashInviteToken(r.token)) }, status: 'sent' },
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
        after: { channel: 'email', batchSize, sent, failed: failedUserIds, pending, skipped, suppressed },
      })
    })
  } catch (error) {
    // The emails already left (or failed); keep the response truthful and at
    // least retire the tokens of undelivered emails.
    logApiError('admin_invitations_delivery_record_failed', error)
    if (retired.length > 0) {
      await prisma.invitationToken.updateMany({
        where: { tokenHash: { in: retired.map((r) => hashInviteToken(r.token)) }, status: 'sent' },
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
): Promise<Array<{ userId: string; email: string; status: 'sent' | 'error' | 'pending' | 'suppressed' }>> {
  const delivery = await prisma.auditLog.findFirst({
    where: { requestId: batchId, action: 'invitation.delivery_recorded' },
    select: { after: true },
  })
  const recorded = (delivery?.after ?? {}) as { sent?: string[]; failed?: string[]; suppressed?: string[] }
  const issued = new Set(issuedUserIds)
  return users
    .filter((user) => issued.has(user.id))
    .map((user) => ({
      userId: user.id,
      email: user.email,
      status: recorded.sent?.includes(user.id) ? 'sent'
        : recorded.suppressed?.includes(user.id) ? 'suppressed'
        : recorded.failed?.includes(user.id) ? 'error' : 'pending',
    }))
}
