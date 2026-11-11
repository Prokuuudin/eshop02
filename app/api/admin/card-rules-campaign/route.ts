import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin, type ServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { invitationBatchId, lockBatch } from '@/lib/invitation-dispatch'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readCampaign,
  writeCampaign,
  isEligibleRulesRecipient,
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_LOCK_MS,
  CAMPAIGN_KV_KEY,
  type CampaignState,
} from '@/lib/invitations'
import { buildRulesEmail } from '@/lib/invitation-emails'
import { parseOffsetPagination } from '@/lib/pagination'

export const runtime = 'nodejs'
export const maxDuration = 60

class CampaignBusyError extends Error {}
class CampaignFinishedError extends Error {}

// Фильтр сегмента B на уровне SQL; isEligibleRulesRecipient дублирует его в памяти
// как страховка + для юнит-тестов.
const ELIGIBLE_WHERE = {
  cardNumber: null,
  platformRole: { not: 'admin' },
  email: { contains: '@', not: { endsWith: '@client.local' } },
} as const

const ELIGIBLE_SORT_FIELDS = ['name', 'email'] as const
type EligibleSortField = (typeof ELIGIBLE_SORT_FIELDS)[number]

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const sortParam = searchParams.get('sort')
    const sortField: EligibleSortField | null = (ELIGIBLE_SORT_FIELDS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as EligibleSortField)
      : null
    const sortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })

    const where: Record<string, unknown> = search
      ? {
          ...ELIGIBLE_WHERE,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : ELIGIBLE_WHERE

    // name не уникален и допускает null — без id-тайбрейка Postgres не гарантирует
    // стабильный порядок между OFFSET-страницами (email @unique, id — PK, им тайбрейк не нужен)
    const orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] =
      sortField === 'name' ? [{ name: sortDir }, { id: 'asc' }]
      : sortField === 'email' ? { email: sortDir }
      : { id: 'asc' }

    const [state, totalEligible, filteredTotal, users] = await Promise.all([
      readCampaign(prisma),
      prisma.user.count({ where: ELIGIBLE_WHERE }),
      // Без активного поиска where === ELIGIBLE_WHERE, второй count был бы точным дублем первого
      search ? prisma.user.count({ where }) : Promise.resolve(null),
      // sent-статус (isEligibleSent) — чистая проверка id <= cursor по каждой строке, она верна
      // при любом порядке сортировки; id asc (дефолт) лишь даёт то, что "отправленные" идут
      // единым видимым блоком в начале списка, а не вразброс
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true },
        orderBy,
        skip,
        take,
      }),
    ])
    const total = search ? (filteredTotal as number) : totalEligible
    return NextResponse.json({ state, totalEligible, total, users })
  } catch (e) {
    logApiError("[card-rules-campaign GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

const CAMPAIGN_LOCK_KEY = 'campaign:card-rules'
const RESET = 'card_rules_campaign.reset'
const STARTED = 'card_rules_campaign.batch_started'
const COMPLETED = 'card_rules_campaign.batch_completed'

type BatchOutcome = { processed: number; sent: number; failed: number; skipped: number; failedUserIds: string[] }

// Internal IDs and counters only — no addresses or names.
function auditState(s: CampaignState) {
  return {
    sentCount: s.sentCount, errorCount: s.errorCount, cursor: s.cursor,
    finished: s.finished, running: Boolean(s.runningSince),
  }
}

function sameState(a: CampaignState, b: CampaignState): boolean {
  return a.sentCount === b.sentCount && a.errorCount === b.errorCount && a.cursor === b.cursor
    && a.lastRunAt === b.lastRunAt && a.finished === b.finished && a.runningSince === b.runningSince
}

/**
 * Persists the batch result (cursor, counters, released lock) together with its
 * audit event, after SMTP. If the audit cannot be written the state is still
 * saved on its own, so a later batch never re-sends what this one delivered.
 */
async function finishBatch(
  req: NextRequest,
  actor: ServerUser,
  batchId: string,
  state: CampaignState,
  outcome: BatchOutcome,
  interrupted: boolean,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await writeCampaign(tx, state)
      await appendServerAudit(tx, req, actor, {
        action: COMPLETED, entityType: 'campaign', entityId: CAMPAIGN_KV_KEY, requestId: batchId,
        after: { channel: 'email', ...outcome, interrupted, ...auditState(state) },
      })
    })
  } catch (error) {
    logApiError('card_rules_campaign_result_audit_failed', error)
    await writeCampaign(prisma, state)
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  let state: CampaignState | undefined
  let running = false
  let batchId = ''
  const outcome: BatchOutcome = { processed: 0, sent: 0, failed: 0, skipped: 0, failedUserIds: [] }
  try {
    const body = (await req.json().catch(() => ({}))) as { reset?: boolean }
    const id = invitationBatchId(req, actor.id, 'card-rules-campaign')
    if (!id) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })
    batchId = id

    // Проверка и захват замка атомарны: advisory lock кампании сериализует
    // параллельные POST, а изменение KV и событие аудита коммитятся вместе.
    let claim: { kind: 'reset' | 'run' | 'replay'; state: CampaignState; replayedAction?: string }
    try {
      claim = await prisma.$transaction(async (tx) => {
        await lockBatch(tx, CAMPAIGN_LOCK_KEY)
        const s = await readCampaign(tx)
        const previous = await tx.auditLog.findFirst({
          where: { requestId: batchId, action: { in: [RESET, STARTED] } },
          select: { action: true },
        })
        if (previous) return { kind: 'replay' as const, state: s, replayedAction: previous.action }
        if (body.reset) {
          const zero: CampaignState = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
          if (sameState(s, zero)) return { kind: 'reset' as const, state: zero }
          await writeCampaign(tx, zero)
          await appendServerAudit(tx, req, actor, {
            action: RESET, entityType: 'campaign', entityId: CAMPAIGN_KV_KEY, requestId: batchId,
            before: auditState(s), after: auditState(zero),
          })
          return { kind: 'reset' as const, state: zero }
        }
        if (s.finished) throw new CampaignFinishedError()
        if (s.runningSince && Date.now() - new Date(s.runningSince).getTime() < CAMPAIGN_LOCK_MS) {
          throw new CampaignBusyError()
        }
        const before = auditState(s)
        s.runningSince = new Date().toISOString()
        await writeCampaign(tx, s)
        await appendServerAudit(tx, req, actor, {
          action: STARTED, entityType: 'campaign', entityId: CAMPAIGN_KV_KEY, requestId: batchId,
          before, after: { channel: 'email', batchLimit: CAMPAIGN_BATCH_SIZE, ...auditState(s) },
        })
        return { kind: 'run' as const, state: s }
      })
    } catch (e) {
      if (e instanceof CampaignFinishedError) {
        return NextResponse.json({ error: 'finished', state: await readCampaign(prisma) }, { status: 409 })
      }
      if (e instanceof CampaignBusyError || (e as { code?: string })?.code === 'P2034') {
        return NextResponse.json({ error: 'busy', state: await readCampaign(prisma) }, { status: 409 })
      }
      throw e
    }

    if (claim.kind === 'replay') {
      // Технический повтор того же запроса: не сбрасываем и не шлём следующий батч.
      if (claim.replayedAction === RESET) return NextResponse.json({ state: claim.state, replayed: true })
      const completed = await prisma.auditLog.findFirst({
        where: { requestId: batchId, action: COMPLETED },
        select: { after: true },
      })
      if (!completed) return NextResponse.json({ error: 'busy', state: claim.state }, { status: 409 })
      const processed = (completed.after as { processed?: number } | null)?.processed ?? 0
      return NextResponse.json({ state: claim.state, processed, replayed: true })
    }
    state = claim.state
    if (claim.kind === 'reset') return NextResponse.json({ state })
    running = true

    const users = await prisma.user.findMany({
      where: {
        ...ELIGIBLE_WHERE,
        ...(state.cursor ? { id: { gt: state.cursor } } : {}),
      },
      select: { id: true, name: true, email: true, platformRole: true, cardNumber: true },
      orderBy: { id: 'asc' },
      take: CAMPAIGN_BATCH_SIZE,
    })

    const templates = await getTemplates()
    const tpl = templates.find((t) => t.id === 'card-rules-ru')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hairshoppro.lv'

    for (const u of users) {
      if (!isEligibleRulesRecipient(u)) {
        // Неподходящие строки пропускаются навсегда — курсор двигаем и здесь
        state.cursor = u.id
        outcome.skipped++
        continue
      }
      const { subject, html } = buildRulesEmail(
        'ru',
        { name: u.name ?? '', siteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )
      try {
        await sendEmail(u.email, subject, html)
        state.sentCount++
        outcome.sent++
      } catch (err) {
        logApiError('card_rules_campaign_email_failed', err)
        state.errorCount++
        outcome.failed++
        outcome.failedUserIds.push(u.id)
      }
      outcome.processed++
      // Курсор двигаем на каждом получателе: обрыв середины батча не перешлёт уже отправленное
      state.cursor = u.id
    }

    // Курсор уже продвинут внутри цикла (при пустом батче остаётся прежним)
    state.finished = users.length < CAMPAIGN_BATCH_SIZE
    state.lastRunAt = new Date().toISOString()
    state.runningSince = null
    await finishBatch(req, actor, batchId, state, outcome, false)
    running = false

    return NextResponse.json({ state, processed: outcome.processed })
  } catch (e) {
    logApiError("[card-rules-campaign POST]", e)
    // Сохраняем продвинутый cursor/sentCount — иначе повторный POST перешлёт тот же батч
    try {
      if (state && running) {
        state.runningSince = null
        await finishBatch(req, actor, batchId, state, outcome, true)
      }
    } catch { /* уже залогировано выше */ }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
