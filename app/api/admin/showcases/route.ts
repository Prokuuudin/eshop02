import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export const runtime = 'nodejs'

type Showcase = {
  id: string
  name: string
  description: string
  slug: string
  productIds: string[]
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
}

const KV_KEY = 'showcases'

async function readData(): Promise<Showcase[]> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return []
  return (row.value as Showcase[]) ?? []
}

async function writeData(data: Showcase[]): Promise<void> {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
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
    const body = (await request.json()) as Omit<Showcase, 'id' | 'createdAt' | 'updatedAt'>
    const data = await readData()
    const now = new Date().toISOString()
    const maxOrder = data.reduce((m, s) => Math.max(m, s.order), 0)
    const item: Showcase = {
      id: `showcase-${Date.now()}`,
      name: body.name ?? '',
      description: body.description ?? '',
      slug: body.slug ?? '',
      productIds: Array.isArray(body.productIds) ? body.productIds : [],
      active: body.active ?? true,
      order: maxOrder + 1,
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
