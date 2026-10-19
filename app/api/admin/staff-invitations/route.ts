import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { hashPassword, requireAdminPermission } from '@/lib/server-auth'
import { getSiteUrl } from '@/lib/site-url'
import {
  buildStaffInvitationEmail,
  STAFF_INVITE_CHANNEL,
  STAFF_INVITE_TTL_HOURS,
} from '@/lib/staff-invitation'

export const runtime = 'nodejs'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(1).max(200).optional(),
  language: z.enum(['ru', 'en', 'lv']).default('ru'),
  reason: z.string().trim().min(5).max(1000),
}).strict()

type InviteCandidate = {
  id: string
  email: string
  name: string | null
  platformRole: string
  companyId: string | null
  companyName: string | null
  teamRole: string | null
  cardNumber: string | null
  mustChangePassword: boolean
  mfaEnabled: boolean
}

function isUnactivatedStaffInvite(user: InviteCandidate, latestDeliveryStatus: string | null): boolean {
  return ['pending', 'sent', 'error'].includes(latestDeliveryStatus ?? '')
    && user.platformRole === 'customer'
    && user.companyId === null
    && user.companyName === null
    && user.teamRole === null
    && user.cardNumber === null
    && user.mustChangePassword
    && !user.mfaEnabled
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(request)
  if (blocked) return blocked

  const actor = await requireAdminPermission('users.manage')
  if (actor instanceof NextResponse) return actor

  let parsed: z.infer<typeof bodySchema>
  try {
    const result = bodySchema.safeParse(await request.json())
    if (!result.success) {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: parsed.email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      companyId: true,
      companyName: true,
      teamRole: true,
      cardNumber: true,
      mustChangePassword: true,
      mfaEnabled: true,
      invitationDeliveries: {
        where: { channel: STAFF_INVITE_CHANNEL },
        orderBy: { sentAt: 'desc' },
        select: { status: true },
        take: 1,
      },
    },
  })

  if (existing && !isUnactivatedStaffInvite(existing, existing.invitationDeliveries[0]?.status ?? null)) {
    return NextResponse.json({ ok: false, error: 'account_exists' }, { status: 409 })
  }

  const reinvited = Boolean(existing)
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_HOURS * 60 * 60 * 1000)
  const temporaryPasswordHash = existing
    ? null
    : await hashPassword(randomBytes(48).toString('base64url'))

  try {
    const created = await prisma.$transaction(async (tx) => {
      let user: InviteCandidate

      if (existing) {
        const current = await tx.user.findUnique({
          where: { id: existing.id },
          select: {
            id: true,
            email: true,
            name: true,
            platformRole: true,
            companyId: true,
            companyName: true,
            teamRole: true,
            cardNumber: true,
            mustChangePassword: true,
            mfaEnabled: true,
          },
        })
        const delivery = await tx.invitationDelivery.findFirst({
          where: { userId: existing.id, channel: STAFF_INVITE_CHANNEL },
          orderBy: { sentAt: 'desc' },
          select: { status: true },
        })
        if (!current || !isUnactivatedStaffInvite(current, delivery?.status ?? null)) {
          throw new Error('account_exists')
        }
        user = current
      } else {
        user = await tx.user.create({
          data: {
            id: randomUUID(),
            email: parsed.email,
            passwordHash: temporaryPasswordHash!,
            name: parsed.name,
            platformRole: 'customer',
            companyId: null,
            companyName: null,
            teamRole: null,
            cardNumber: null,
            bonusPoints: 0,
            mustChangePassword: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            platformRole: true,
            companyId: true,
            companyName: true,
            teamRole: true,
            cardNumber: true,
            mustChangePassword: true,
            mfaEnabled: true,
          },
        })
      }

      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
      await tx.passwordResetToken.create({
        data: { tokenHash: sha256(token), userId: user.id, expiresAt },
      })
      const delivery = await tx.invitationDelivery.create({
        data: { userId: user.id, channel: STAFF_INVITE_CHANNEL, status: 'pending' },
        select: { id: true },
      })
      await appendServerAudit(tx, request, actor, {
        action: reinvited ? 'user.staff_invitation_resent' : 'user.staff_invitation_created',
        entityType: 'user',
        entityId: user.id,
        entityTitle: user.email,
        after: {
          email: user.email,
          platformRole: user.platformRole,
          teamRole: user.teamRole,
          cardNumber: user.cardNumber,
          mustChangePassword: user.mustChangePassword,
          invitationExpiresAt: expiresAt,
        },
        reason: parsed.reason,
      })
      return { user, deliveryId: delivery.id }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    const activationUrl = `${getSiteUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`
    const message = buildStaffInvitationEmail({
      language: parsed.language,
      name: created.user.name,
      activationUrl,
    })

    try {
      await sendEmail(created.user.email, message.subject, message.html, {
        correlationId: request.headers.get('x-request-id') ?? undefined,
      })
      await prisma.invitationDelivery.update({
        where: { id: created.deliveryId },
        data: { status: 'sent' },
      })
    } catch {
      await prisma.invitationDelivery.update({
        where: { id: created.deliveryId },
        data: { status: 'error' },
      }).catch(() => undefined)
      return NextResponse.json({ ok: false, error: 'email_send_failed' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      userId: created.user.id,
      email: created.user.email,
      reinvited,
      expiresAt: expiresAt.toISOString(),
    }, { status: reinvited ? 200 : 201 })
  } catch (error) {
    if (
      (error instanceof Error && error.message === 'account_exists')
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    ) {
      return NextResponse.json({ ok: false, error: 'account_exists' }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ ok: false, error: 'concurrent_update' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
