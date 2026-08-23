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

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as Partial<PromoCampaign>
    const data = await readData()
    const idx = data.findIndex((item) => item.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const merged = { ...data[idx], ...body }
    const name = String(merged.name ?? '').trim()
    const type = merged.type === 'free_shipping' ? 'free_shipping' : merged.type === 'discount' ? 'discount' : null
    const startDate = String(merged.startDate ?? '').slice(0, 10)
    const endDate = String(merged.endDate ?? '').slice(0, 10)
    if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
    if (!type) return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
    if (!startDate || (endDate && endDate < startDate)) return NextResponse.json({ error: 'invalid_dates' }, { status: 400 })
    const now = new Date().toISOString()
    data[idx] = {
      ...data[idx], ...body, id, name, type, startDate, endDate,
      description: String(merged.description ?? '').trim(),
      discountPercent: type === 'discount' ? Math.min(100, Math.max(0, Number(merged.discountPercent) || 0)) : 0,
      minOrderAmount: Math.max(0, Number(merged.minOrderAmount) || 0),
      targetCategories: Array.isArray(merged.targetCategories) ? [...new Set(merged.targetCategories.map(String).filter(Boolean))] : [],
      targetSubcategories: Array.isArray(merged.targetSubcategories) ? [...new Set(merged.targetSubcategories.map(String).filter(Boolean))] : [],
      targetBrands: Array.isArray(merged.targetBrands) ? [...new Set(merged.targetBrands.map(String).filter(Boolean))] : [],
      updatedAt: now,
    }
    await writeData(data)
    return NextResponse.json(data[idx])
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<Response> {
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
