import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { PendingRegistration } from '@/app/api/auth/register/route'
import { hashToken, createSession, SESSION_COOKIE } from '@/lib/server-auth'

export const runtime = 'nodejs'

type PendingData = { registrations: PendingRegistration[] }
type Tx = ExtendedTransactionClient

const KV_KEY = 'pending-registrations'

class TokenInvalidError extends Error {}
class TokenExpiredError extends Error {}
class EmailTakenError extends Error {}
class CompanyGoneError extends Error {}

async function readPending(tx: Tx): Promise<PendingData> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { registrations: [] }
  return (row.value as PendingData) ?? { registrations: [] }
}

async function writePending(tx: Tx, data: PendingData): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

// Same optimistic-concurrency dance as register/route.ts — see withPendingTransaction there.
async function withPendingTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2034' && attempt < 4) continue
      throw e
    }
  }
}

// GET /api/auth/confirm?token=xxx
// Атомарно создаёт User + CompanyMember на сервере и открывает сессию (cookie).
// Клиенту не возвращается ничего чувствительного — ни payload, ни пароль.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const tokenHash = hashToken(token)
  let userId: string

  try {
    userId = await withPendingTransaction(async (tx) => {
      const data = await readPending(tx)
      const idx = data.registrations.findIndex((r) => r.tokenHash === tokenHash)
      if (idx === -1) throw new TokenInvalidError()
      const reg = data.registrations[idx]

      // Токен одноразовый — потребляем его независимо от исхода ниже,
      // чтобы протухший/битый pending-запрос нельзя было повторно предъявить.
      data.registrations = data.registrations.filter((_, i) => i !== idx)
      await writePending(tx, data)

      if (new Date(reg.expiresAt) < new Date()) throw new TokenExpiredError()

      const existingUser = await tx.user.findUnique({ where: { email: reg.email }, select: { id: true } })
      if (existingUser) throw new EmailTakenError()

      const company = await tx.company.findUnique({ where: { id: reg.companyId } })
      if (!company) throw new CompanyGoneError()

      const id = randomUUID()
      await tx.user.create({
        data: {
          id,
          email: reg.email,
          passwordHash: reg.passwordHash,
          name: reg.name ?? null,
          cardNumber: reg.cardNumber,
          phone: reg.phone ?? null,
          platformRole: 'customer',
          companyId: reg.companyId,
          companyName: reg.companyName,
          teamRole: 'buyer',
          approvalRequired: company.approvalWorkflowEnabled,
          auditLoggingEnabled: true,
          mustChangePassword: false,
        },
      })
      await tx.companyMember.create({
        data: {
          id: randomUUID(),
          companyId: reg.companyId,
          userId: id,
          email: reg.email,
          role: 'buyer',
          name: reg.name || reg.email,
        },
      })

      return id
    })
  } catch (e) {
    if (e instanceof TokenInvalidError) {
      return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
    }
    if (e instanceof TokenExpiredError) {
      return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
    }
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ ok: false, error: 'email_taken' }, { status: 409 })
    }
    if (e instanceof CompanyGoneError) {
      return NextResponse.json({ ok: false, error: 'company_not_found' }, { status: 404 })
    }
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 })
    }
    console.error('[auth/confirm]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }

  const sessionToken = await createSession(userId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
