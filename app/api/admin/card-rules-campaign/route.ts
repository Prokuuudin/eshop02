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
} from '@/lib/invitations'
import { buildRulesEmail } from '@/lib/invitation-emails'

export const runtime = 'nodejs'
export const maxDuration = 60

// Фильтр сегмента B на уровне SQL; isEligibleRulesRecipient дублирует его в памяти
// как страховка + для юнит-тестов.
const ELIGIBLE_WHERE = {
  cardNumber: null,
  platformRole: { not: 'admin' },
  email: { contains: '@', not: { endsWith: '@client.local' } },
} as const

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const [state, totalEligible] = await Promise.all([
      readCampaign(prisma),
      prisma.user.count({ where: ELIGIBLE_WHERE }),
    ])
    return NextResponse.json({ state, totalEligible })
  } catch (e) {
    console.error('[card-rules-campaign GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json().catch(() => ({}))) as { reset?: boolean }
    let state = await readCampaign(prisma)

    if (body.reset) {
      state = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
      await writeCampaign(prisma, state)
      return NextResponse.json({ state })
    }

    if (state.finished) {
      return NextResponse.json({ error: 'finished', state }, { status: 409 })
    }
    // Замок от параллельных батчей
    if (state.runningSince && Date.now() - new Date(state.runningSince).getTime() < CAMPAIGN_LOCK_MS) {
      return NextResponse.json({ error: 'busy', state }, { status: 409 })
    }
    state.runningSince = new Date().toISOString()
    await writeCampaign(prisma, state)

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
      if (!isEligibleRulesRecipient(u)) continue
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
    }

    state.cursor = users.length > 0 ? users[users.length - 1].id : state.cursor
    state.finished = users.length < CAMPAIGN_BATCH_SIZE
    state.lastRunAt = new Date().toISOString()
    state.runningSince = null
    await writeCampaign(prisma, state)

    return NextResponse.json({ state, processed })
  } catch (e) {
    console.error('[card-rules-campaign POST]', e)
    // снять замок, чтобы не заблокировать кампанию навсегда
    try {
      const state = await readCampaign(prisma)
      state.runningSince = null
      await writeCampaign(prisma, state)
    } catch { /* уже залогировано выше */ }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
