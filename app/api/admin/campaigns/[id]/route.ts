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

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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
