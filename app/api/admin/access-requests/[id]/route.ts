import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
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
import { z } from 'zod'
import { hasAdminPermission, isProtectedStaffAccount } from '@/lib/admin-permissions'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['approved', 'rejected'])
const approvalBodySchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(2000).optional(),
  approvedTeamRole: z.string().max(50).optional(),
  cardNumber: z.string().max(100).optional(),
  customerType: z.enum(['individual', 'company']).optional(),
  companyName: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(50).optional(),
}).strict()

const REQUEST_SELECT = {
  id: true, email: true, status: true, reviewedAt: true,
  reviewedByEmail: true, approvedTeamRole: true, reviewNote: true,
} as const

/** Another reviewer decided the request between our read and our transaction. */
class AlreadyDecidedError extends Error {
  constructor() {
    super('already_decided')
    this.name = 'AlreadyDecidedError'
  }
}

async function alreadyDecidedResponse(id: string): Promise<Response> {
  const current = await prisma.accessRequest.findUnique({ where: { id }, select: { status: true } })
  return NextResponse.json({ error: 'already_decided', status: current?.status ?? null }, { status: 409 })
}

function uniqueConflictTarget(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null
  return JSON.stringify(error.meta?.target ?? '')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || !hasAdminPermission(user, 'customers.read')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.accessRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const parsedBody = approvalBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsedBody.success || !ALLOWED_STATUSES.has(parsedBody.data.status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }
    const body = parsedBody.data

    // Решение — однократный переход из pending. Повтор (двойной клик, ретрай сети,
    // второй администратор) не должен заново создавать аккаунт, приглашение,
    // письмо и событие аудита, а смена решения задним числом не отменяет уже
    // выданную карту.
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'already_decided', status: existing.status }, { status: 409 })
    }

    const approvedTeamRole = body.status === 'approved' ? (body.approvedTeamRole ?? 'viewer') : null
    const decision = {
      status: body.status,
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      reviewedByEmail: user.email,
      reviewNote: body.reviewNote ?? null,
      approvedTeamRole,
    }
    // Условный UPDATE под row lock: из нескольких конкурентных решений
    // проходит ровно одно, остальные откатывают свою транзакцию целиком.
    const claimDecision = async (tx: ExtendedTransactionClient): Promise<void> => {
      const claimed = await tx.accessRequest.updateMany({ where: { id, status: 'pending' }, data: decision })
      if (claimed.count !== 1) throw new AlreadyDecidedError()
    }
    // Журнал хранит только решение: без email/имени/телефона заявителя,
    // сертификата, номера карты, заметки и токена приглашения.
    const auditBase = {
      entityType: 'access_request',
      entityId: id,
      before: { status: 'pending', approvedTeamRole: null },
    }

    // Одобрение заявки на карту: карта должна попасть в Neon, иначе клиент
    // не появится в списке держателей на /admin/invitations. Создаём «спящий»
    // аккаунт из данных заявки (паттерн import-client-cards). Одна карта =
    // один аккаунт: для no-card номер выдаёт админ (body), для card-заявки
    // номер уже в самой заявке.
    if (body.status === 'approved') {
      const customerType = body.customerType ?? 'individual'
      const registrationNumber = body.registrationNumber?.replace(/\D/gu, '') || null
      if (customerType === 'company' && (!body.companyName || !registrationNumber || registrationNumber.length !== 11)) {
        return NextResponse.json({ error: 'invalid_company_details' }, { status: 400 })
      }
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
          select: { id: true, cardNumber: true, platformRole: true, teamRole: true, superAdmin: true },
        }),
      ]

      // The request email is not verified: approving it onto a staff account would attach
      // the requester's card and force a password change — a takeover path via register-card.
      if (sameEmail && isProtectedStaffAccount(sameEmail)) {
        return NextResponse.json({ error: 'staff_account' }, { status: 409 })
      }
      if (cardOwner && cardOwner.id !== sameEmail?.id) {
        return NextResponse.json({ error: 'card_taken' }, { status: 409 })
      }
      if (sameEmail?.cardNumber && normalizeCardNumber(sameEmail.cardNumber) !== cardNumber) {
        return NextResponse.json({ error: 'user_has_card', cardNumber: sameEmail.cardNumber }, { status: 409 })
      }

      // The token is persisted in the same transaction as the decision, before
      // SMTP is attempted: a failed delivery can be retried from the invitations
      // screen without recreating the account, and a rolled-back decision never
      // leaves a live invitation behind.
      const token = newInviteToken()
      const language = resolveInviteLang(existing.language ?? undefined)
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

      let result: { request: Prisma.AccessRequestGetPayload<{ select: typeof REQUEST_SELECT }>; targetUserId: string }
      try {
        result = await prisma.$transaction(async (tx) => {
          await claimDecision(tx)
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
                customerType,
                companyName: customerType === 'company' ? body.companyName : null,
                registrationNumber: customerType === 'company' ? registrationNumber : null,
              },
            })
          } else {
            const created = await tx.user.create({
              data: {
                id: randomUUID(),
                email: existing.email.toLowerCase(),
                // Хэш из заявки: это пароль, который клиент сам ввёл при подаче
                // заявки (не общий дефолт) — но mustChangePassword:true всё равно
                // блокирует им доступ до активации по инвайту, где выбирается
                // финальный пароль.
                passwordHash: existing.passwordHash,
                name: existing.name,
                phone: existing.phone,
                cardNumber,
                companyName: customerType === 'company' ? body.companyName : null,
                customerType,
                registrationNumber: customerType === 'company' ? registrationNumber : null,
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
          const certificateDeleted = await deleteCertificate(tx, id)
          await replaceInvitation(tx, {
            userId: targetUserId,
            email: existing.email.toLowerCase(),
            cardNumber,
            token,
            expiresAt: expiresAt.toISOString(),
            language,
          })
          await appendServerAudit(tx, req, user, {
            ...auditBase,
            action: 'access_request.approved',
            after: {
              status: 'approved',
              approvedTeamRole,
              requestType: existing.requestType,
              customerType,
              account: { userId: targetUserId, action: sameEmail ? 'updated' : 'created' },
              invitation: { created: true, expiresAt: expiresAt.toISOString() },
              certificateDeleted,
            },
          })
          const request = await tx.accessRequest.findUniqueOrThrow({ where: { id }, select: REQUEST_SELECT })
          return { request, targetUserId }
        })
      } catch (error) {
        if (error instanceof AlreadyDecidedError) return await alreadyDecidedResponse(id)
        const target = uniqueConflictTarget(error)
        // Concurrent approval of another request claimed the same card or email.
        if (target !== null) {
          return NextResponse.json({ error: target.includes('cardNumber') ? 'card_taken' : 'concurrent_update' }, { status: 409 })
        }
        throw error
      }

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
        // The decision, account, invitation and audit row are already committed.
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

    let updated: Prisma.AccessRequestGetPayload<{ select: typeof REQUEST_SELECT }>
    try {
      updated = await prisma.$transaction(async (tx) => {
        await claimDecision(tx)
        const certificateDeleted = await deleteCertificate(tx, id)
        await appendServerAudit(tx, req, user, {
          ...auditBase,
          action: 'access_request.rejected',
          after: { status: 'rejected', approvedTeamRole: null, requestType: existing.requestType, certificateDeleted },
        })
        return tx.accessRequest.findUniqueOrThrow({ where: { id }, select: REQUEST_SELECT })
      })
    } catch (error) {
      if (error instanceof AlreadyDecidedError) return await alreadyDecidedResponse(id)
      throw error
    }
    return NextResponse.json({ request: updated })
  } catch (e) {
    logApiError("[admin/access-requests/:id PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
