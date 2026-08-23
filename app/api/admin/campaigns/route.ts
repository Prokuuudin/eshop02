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
  targetSubcategories: string[]
  targetBrands: string[]
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

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await readData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'>
    const name = String(body.name ?? '').trim()
    const type = body.type === 'free_shipping' ? 'free_shipping' : body.type === 'discount' ? 'discount' : null
    const startDate = String(body.startDate ?? '').slice(0, 10)
    const endDate = String(body.endDate ?? '').slice(0, 10)
    if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
    if (!type) return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
    if (!startDate || (endDate && endDate < startDate)) return NextResponse.json({ error: 'invalid_dates' }, { status: 400 })
    const data = await readData()
    const now = new Date().toISOString()
    const item: PromoCampaign = {
      id: `campaign-${Date.now()}`,
      name,
      description: String(body.description ?? '').trim(),
      type,
      discountPercent: type === 'discount' ? Math.min(100, Math.max(0, Number(body.discountPercent) || 0)) : 0,
      startDate,
      endDate,
      active: body.active ?? true,
      targetCategories: Array.isArray(body.targetCategories) ? [...new Set(body.targetCategories.map(String).filter(Boolean))] : [],
      targetSubcategories: Array.isArray(body.targetSubcategories) ? [...new Set(body.targetSubcategories.map(String).filter(Boolean))] : [],
      targetBrands: Array.isArray(body.targetBrands) ? [...new Set(body.targetBrands.map(String).filter(Boolean))] : [],
      minOrderAmount: Math.max(0, Number(body.minOrderAmount) || 0),
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
