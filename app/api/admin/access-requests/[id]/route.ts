import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['approved', 'rejected'])
const CARD_RE = /^\d{4,10}$/

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Одобрение заявки мастера (no-card): выданная карта должна попасть в Neon,
    // иначе клиент не появится в списке держателей на /admin/invitations.
    // Создаём «спящий» аккаунт из данных заявки (паттерн import-client-cards).
    if (body.status === 'approved' && existing.requestType === 'no-card') {
      const cardNumber = (body.cardNumber ?? '').trim()
      if (!CARD_RE.test(cardNumber)) {
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
      if (sameEmail?.cardNumber && sameEmail.cardNumber !== cardNumber) {
        return NextResponse.json({ error: 'user_has_card', cardNumber: sameEmail.cardNumber }, { status: 409 })
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (sameEmail) {
          if (sameEmail.cardNumber !== cardNumber) {
            await tx.user.update({ where: { id: sameEmail.id }, data: { cardNumber } })
          }
        } else {
          await tx.user.create({
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
            },
          })
        }
        return tx.accessRequest.update(requestUpdate)
      })

      return NextResponse.json({ request: updated, cardNumber })
    }

    const updated = await prisma.accessRequest.update(requestUpdate)
    return NextResponse.json({ request: updated })
  } catch (e) {
    console.error('[admin/access-requests/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
