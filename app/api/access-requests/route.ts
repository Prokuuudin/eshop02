import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string
      password?: string
      name?: string
      phone?: string
      companyId?: string
      companyName?: string
      cardNumber?: string
      requestType?: string
      certificateName?: string
      message?: string
      language?: string
    }

    const { email, password, companyId, companyName, cardNumber } = body
    const isNoCard = body.requestType === 'no-card'
    // Заявка мастера (no-card) подаётся без компании и карты — карту выдаёт
    // админ при одобрении; для card-заявок компания и карта обязательны
    if (!email || !password || (!isNoCard && (!companyId || !companyName || !cardNumber))) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Prevent duplicate pending requests for same email
    const existing = await prisma.accessRequest.findFirst({
      where: { email: email.trim().toLowerCase(), status: 'pending' },
    })
    if (existing) {
      return NextResponse.json({ error: 'pending_exists' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)

    const req_ = await prisma.accessRequest.create({
      data: {
        id: randomUUID(),
        email: email.trim().toLowerCase(),
        passwordHash,
        name: body.name ?? null,
        phone: body.phone ?? null,
        companyId: companyId ?? '',
        companyName: companyName ?? '',
        cardNumber: cardNumber ?? '',
        requestType: body.requestType ?? 'card',
        certificateName: body.certificateName ?? null,
        message: body.message ?? null,
        language: body.language ?? null,
        status: 'pending',
      },
    })

    return NextResponse.json({ id: req_.id }, { status: 201 })
  } catch (e) {
    console.error('[access-requests POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
