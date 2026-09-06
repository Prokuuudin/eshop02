import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { getTemplates } from '@/lib/email-templates-server-store'
import { interpolate } from '@/lib/invitation-emails'
import { getSiteUrl } from '@/lib/site-url'
import { logApiError } from '@/lib/observability'
import { INVITE_BATCH_SIZE, resolveInviteLang } from '@/lib/invitations'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json() as { userIds?: string[]; language?: string }
    const userIds = Array.isArray(body.userIds) ? body.userIds : []
    if (userIds.length === 0) return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    if (userIds.length > INVITE_BATCH_SIZE) {
      return NextResponse.json({ error: 'too_many', max: INVITE_BATCH_SIZE }, { status: 400 })
    }

    const language = resolveInviteLang(body.language)
    const template = (await getTemplates()).find((item) => item.id === `sms-invite-${language}`)
    if (!template) return NextResponse.json({ error: 'template_not_found' }, { status: 500 })

    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        cardNumber: { not: null },
        phone: { not: null },
        privacyAcknowledgedAt: null,
        NOT: { phone: '' },
      },
      select: { id: true, name: true, phone: true, cardNumber: true },
    })

    // Development-only transport. Production must never report a fake delivery.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'sms_provider_not_configured' }, { status: 503 })
    }

    const registrationUrl = `${getSiteUrl()}/auth/register`
    const results = users.map((user) => ({
      userId: user.id,
      phone: user.phone,
      status: 'simulated' as const,
      message: interpolate(template.body, {
        name: user.name ?? '',
        card_number: user.cardNumber ?? '',
        registration_url: registrationUrl,
      }),
    }))
    if (results.length > 0) {
      await prisma.invitationDelivery.createMany({
        data: results.map((result) => ({
          userId: result.userId,
          channel: 'sms',
          status: 'sent',
        })),
      })
    }
    return NextResponse.json({ simulated: true, results })
  } catch (error) {
    logApiError('[admin/invitations/sms POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
