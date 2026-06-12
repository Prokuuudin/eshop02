import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

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

const KV_KEY = 'promo-campaigns'

async function readData(): Promise<PromoCampaign[]> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return []
  return (row.value as PromoCampaign[]) ?? []
}

async function writeData(data: PromoCampaign[]): Promise<void> {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await readData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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
      updatedAt: now,
    }
    data.push(item)
    await writeData(data)
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
