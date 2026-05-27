import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

type PromoCampaign = {
  id: string
  name: string
  description: string
  type: 'discount' | 'gift' | 'bundle' | 'free_shipping'
  discountPercent: number
  startDate: string
  endDate: string
  active: boolean
  targetCategories: string[]
  minOrderAmount: number
  createdAt: string
  updatedAt: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'promo-campaigns.json')

async function readData(): Promise<PromoCampaign[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    return JSON.parse(raw) as PromoCampaign[]
  } catch {
    return []
  }
}

async function writeData(data: PromoCampaign[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await request.json()) as Partial<PromoCampaign>
    const data = await readData()
    const idx = data.findIndex((item) => item.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const now = new Date().toISOString()
    data[idx] = { ...data[idx], ...body, id, updatedAt: now }
    await writeData(data)
    return NextResponse.json(data[idx])
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const data = await readData()
    const idx = data.findIndex((item) => item.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    data.splice(idx, 1)
    await writeData(data)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
