import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readCampaign,
  writeCampaign,
  isEligibleRulesRecipient,
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_LOCK_MS,
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

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  let state: CampaignState | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as { reset?: boolean }

    // Проверка и захват замка атомарны (serializable) — два параллельных POST
    // не могут оба пройти busy-check и разослать один и тот же батч
    try {
      state = await prisma.$transaction(
        async (tx) => {
          const s = await readCampaign(tx)
          if (body.reset) {
            const zero: CampaignState = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
            await writeCampaign(tx, zero)
            return zero
          }
          if (s.finished) throw new CampaignFinishedError()
          if (s.runningSince && Date.now() - new Date(s.runningSince).getTime() < CAMPAIGN_LOCK_MS) {
            throw new CampaignBusyError()
          }
          s.runningSince = new Date().toISOString()
          await writeCampaign(tx, s)
          return s
        },
        { isolationLevel: 'Serializable' }
      )
    } catch (e) {
      if (e instanceof CampaignFinishedError) {
        return NextResponse.json({ error: 'finished', state: await readCampaign(prisma) }, { status: 409 })
      }
      if (e instanceof CampaignBusyError || (e as { code?: string })?.code === 'P2034') {
        return NextResponse.json({ error: 'busy', state: await readCampaign(prisma) }, { status: 409 })
      }
      throw e
    }
    if (body.reset) return NextResponse.json({ state })

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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://miksplus.eu'

    let processed = 0
    for (const u of users) {
      if (!isEligibleRulesRecipient(u)) {
        // Неподходящие строки пропускаются навсегда — курсор двигаем и здесь
        state.cursor = u.id
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
      } catch (err) {
        logApiError('card_rules_campaign_email_failed', err)
        state.errorCount++
      }
      processed++
      // Курсор двигаем на каждом получателе: обрыв середины батча не перешлёт уже отправленное
      state.cursor = u.id
    }

    // Курсор уже продвинут внутри цикла (при пустом батче остаётся прежним)
    state.finished = users.length < CAMPAIGN_BATCH_SIZE
    state.lastRunAt = new Date().toISOString()
    state.runningSince = null
    await writeCampaign(prisma, state)

    return NextResponse.json({ state, processed })
  } catch (e) {
    logApiError("[card-rules-campaign POST]", e)
    // Сохраняем продвинутый cursor/sentCount — иначе повторный POST перешлёт тот же батч
    try {
      if (state) {
        state.runningSince = null
        await writeCampaign(prisma, state)
      }
    } catch { /* уже залогировано выше */ }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}




