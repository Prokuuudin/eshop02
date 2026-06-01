import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

type PromoCodeItem = {
  id: string
  code: string
  discount: number
  minOrder: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  active: boolean
  description: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'promo-codes.json')

async function readData(): Promise<PromoCodeItem[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    return JSON.parse(raw) as PromoCodeItem[]
  } catch {
    return []
  }
}

async function writeData(data: PromoCodeItem[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const data = await readData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Omit<PromoCodeItem, 'id'>
    const data = await readData()
    const code = (body.code ?? '').toUpperCase().trim()
    if (data.some((d) => d.code === code)) {
      return NextResponse.json({ error: 'duplicate_code' }, { status: 409 })
    }
    const item: PromoCodeItem = {
      id: `pc-${Date.now()}`,
      code,
      discount: Number(body.discount) || 0,
      minOrder: Number(body.minOrder) || 0,
      maxUses: body.maxUses !== null && body.maxUses !== undefined ? Number(body.maxUses) : null,
      usedCount: Number(body.usedCount) || 0,
      expiresAt: body.expiresAt ?? null,
      active: body.active ?? true,
      description: body.description ?? ''
    }
    data.push(item)
    await writeData(data)
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
