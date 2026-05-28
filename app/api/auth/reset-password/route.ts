import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

type ResetRecord = { token: string; email: string; expiresAt: string }
type ResetData = { resets: ResetRecord[] }

const DATA_PATH = path.join(process.cwd(), 'data', 'password-resets.json')

async function read(): Promise<ResetData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as ResetData
  } catch {
    return { resets: [] }
  }
}

async function write(data: ResetData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// GET ?token=xxx — проверить токен (не удаляет)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const data = await read()
  const record = data.resets.find((r) => r.token === token)
  if (!record) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (new Date(record.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  return NextResponse.json({ ok: true, email: record.email })
}

// POST { token } — использовать токен, получить email (одноразово)
export async function POST(request: NextRequest): Promise<NextResponse> {
  let token: string
  try {
    const body = (await request.json()) as { token?: string }
    token = (body.token ?? '').trim()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const data = await read()
  const idx = data.resets.findIndex((r) => r.token === token)
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (new Date(data.resets[idx].expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  const { email } = data.resets[idx]
  data.resets.splice(idx, 1)
  await write(data)

  return NextResponse.json({ ok: true, email })
}
