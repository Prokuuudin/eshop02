import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { PendingRegistration } from '@/app/api/auth/register/route'

export const runtime = 'nodejs'

type PendingData = { registrations: PendingRegistration[] }

const DATA_PATH = path.join(process.cwd(), 'data', 'pending-registrations.json')

async function readPending(): Promise<PendingData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as PendingData
  } catch {
    return { registrations: [] }
  }
}

async function writePending(data: PendingData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
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
