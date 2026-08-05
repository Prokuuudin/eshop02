import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const [state, totalEligible, users] = await Promise.all([
      readCampaign(prisma),
      prisma.user.count({ where: ELIGIBLE_WHERE }),
      // id asc — тот же порядок, в котором курсор кампании проходит получателей
      // (см. POST ниже), иначе sent-статус по курсору будет врать
      prisma.user.findMany({
        where: ELIGIBLE_WHERE,
        select: { id: true, name: true, email: true },
        orderBy: { id: 'asc' },
      }),
    ])
    return NextResponse.json({ state, totalEligible, users })
  } catch (e) {
    console.error('[card-rules-campaign GET]', e)
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
        console.error('[card-rules-campaign] sendEmail failed for', u.email, err)
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
    console.error('[card-rules-campaign POST]', e)
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
