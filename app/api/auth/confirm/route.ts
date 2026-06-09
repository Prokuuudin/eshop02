import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { PendingRegistration } from '@/app/api/auth/register/route'

export const runtime = 'nodejs'

type PendingData = { registrations: PendingRegistration[] }

const KV_KEY = 'pending-registrations'

async function readPending(): Promise<PendingData> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { registrations: [] }
  return (row.value as PendingData) ?? { registrations: [] }
}

async function writePending(data: PendingData): Promise<void> {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

// GET /api/auth/confirm?token=xxx
// Возвращает данные регистрации для создания аккаунта на клиенте
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const data = await readPending()
  const reg = data.registrations.find((r) => r.token === token)

  if (!reg) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }

  if (new Date(reg.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  // Удаляем из pending (одноразовый токен)
  data.registrations = data.registrations.filter((r) => r.token !== token)
  await writePending(data)

  // Возвращаем данные для активации на клиенте
  const { token: _t, expiresAt: _e, ...payload } = reg
  return NextResponse.json({ ok: true, payload })
}
