import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { deleteCertificate } from '@/lib/certificate-store'
import { sendEmail } from '@/lib/mailer'
import { buildInviteEmail, pickInviteTemplate } from '@/lib/invitation-emails'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  hashInviteToken,
  INVITE_TTL_DAYS,
  newInviteToken,
  replaceInvitation,
  resolveInviteLang,
} from '@/lib/invitations'
import { getSiteUrl } from '@/lib/site-url'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['approved', 'rejected'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.accessRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const body = (await req.json()) as {
      status?: string
      reviewNote?: string
      approvedTeamRole?: string
      cardNumber?: string
      companyName?: string
    }

    if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }

    const requestUpdate = {
      where: { id },
      data: {
        status: body.status,
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
        reviewedByEmail: user.email,
        reviewNote: body.reviewNote ?? null,
        approvedTeamRole: body.status === 'approved' ? (body.approvedTeamRole ?? 'viewer') : null,
      },
      select: {
        id: true, email: true, status: true, reviewedAt: true,
        reviewedByEmail: true, approvedTeamRole: true, reviewNote: true,
      },
    }

    // Одобрение заявки на карту: карта должна попасть в Neon, иначе клиент
    // не появится в списке держателей на /admin/invitations. Создаём «спящий»
    // аккаунт из данных заявки (паттерн import-client-cards). Одна карта =
    // один аккаунт: для no-card номер выдаёт админ (body), для card-заявки
    // номер уже в самой заявке.
    if (body.status === 'approved') {
      const cardNumber = normalizeCardNumber(body.cardNumber ?? existing.cardNumber ?? '')
      if (!isValidCardNumber(cardNumber)) {
        return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
      }

      const [cardOwner, sameEmail] = [
        await prisma.user.findFirst({
          where: { cardNumber },
          select: { id: true },
        }),
        await prisma.user.findFirst({
          where: { email: { equals: existing.email, mode: 'insensitive' } },
          select: { id: true, cardNumber: true },
        }),
      ]

      if (cardOwner && cardOwner.id !== sameEmail?.id) {
        return NextResponse.json({ error: 'card_taken' }, { status: 409 })
      }
      if (sameEmail?.cardNumber && normalizeCardNumber(sameEmail.cardNumber) !== cardNumber) {
        return NextResponse.json({ error: 'user_has_card', cardNumber: sameEmail.cardNumber }, { status: 409 })
      }

      const result = await prisma.$transaction(async (tx) => {
        let targetUserId: string
        if (sameEmail) {
          targetUserId = sameEmail.id
          await tx.user.update({
            where: { id: sameEmail.id },
            data: {
              cardNumber,
              mustChangePassword: true,
              privacyNoticeVersion: existing.privacyNoticeVersion,
              privacyAcknowledgedAt: existing.privacyAcknowledgedAt,
              marketingConsent: existing.marketingConsent,
              marketingConsentAt: existing.marketingConsentAt,
            },
          })
        } else {
          const created = await tx.user.create({
            data: {
              id: randomUUID(),
              email: existing.email.toLowerCase(),
              // Хэш из заявки: пароль клиенту уже отправлен письмом (Welcome1!),
              // вход возможен сразу; активация по инвайту заменит пароль
              passwordHash: existing.passwordHash,
              name: existing.name,
              phone: existing.phone,
              cardNumber,
              companyName: body.companyName?.trim() || null,
              platformRole: 'customer',
              mustChangePassword: true,
              privacyNoticeVersion: existing.privacyNoticeVersion,
              privacyAcknowledgedAt: existing.privacyAcknowledgedAt,
              marketingConsent: existing.marketingConsent,
              marketingConsentAt: existing.marketingConsentAt,
            },
          })
          targetUserId = created.id
        }
        // Решение принято — временный сертификат больше не нужен
        await deleteCertificate(tx, id)
        const request = await tx.accessRequest.update(requestUpdate)
        return { request, targetUserId }
      })

      // Approval and invitation creation are one server workflow. The token is
      // persisted before SMTP is attempted, so a failed delivery can be safely
      // retried from the invitations screen without recreating the account.
      const token = newInviteToken()
      const language = resolveInviteLang(existing.language ?? undefined)
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
      await replaceInvitation(prisma, {
        userId: result.targetUserId,
        email: existing.email.toLowerCase(),
        cardNumber,
        token,
        expiresAt: expiresAt.toISOString(),
        language,
      })

      const templates = await getTemplates()
      const tpl = pickInviteTemplate(templates, language)
      const inviteUrl = `${getSiteUrl()}/auth/invite?token=${token}`
      const mail = buildInviteEmail(
        language,
        { name: existing.name ?? '', cardNumber, inviteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined,
      )
      try {
        await sendEmail(existing.email, mail.subject, mail.html)
      } catch (emailError) {
        await prisma.invitationToken.updateMany({
          where: { tokenHash: hashInviteToken(token), status: 'sent' },
          data: { status: 'error' },
        })
        logApiError("[admin/access-requests/:id PATCH] invitation email failed", emailError)
        return NextResponse.json(
          { request: result.request, cardNumber, userId: result.targetUserId, emailStatus: 'error' },
          { status: 502 },
        )
      }

      return NextResponse.json({
        request: result.request,
        cardNumber,
        userId: result.targetUserId,
        emailStatus: 'sent',
      })
    }

    const updated = await prisma.accessRequest.update(requestUpdate)
    await deleteCertificate(prisma, id)
    return NextResponse.json({ request: updated })
  } catch (e) {
    logApiError("[admin/access-requests/:id PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





