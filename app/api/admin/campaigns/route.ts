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
    const body = (await request.json()) as Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'>
    const data = await readData()
    const now = new Date().toISOString()
    const item: PromoCampaign = {
      id: `campaign-${Date.now()}`,
      name: body.name ?? '',
      description: body.description ?? '',
      type: body.type ?? 'discount',
      discountPercent: Number(body.discountPercent) || 0,
      startDate: body.startDate ?? now,
      endDate: body.endDate ?? now,
      active: body.active ?? true,
      targetCategories: Array.isArray(body.targetCategories) ? body.targetCategories : [],
      minOrderAmount: Number(body.minOrderAmount) || 0,
      createdAt: now,
      updatedAt: now
    }
    data.push(item)
    await writeData(data)
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
