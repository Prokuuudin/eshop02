import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

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

const DATA_FILE = path.join(process.cwd(), 'data', 'showcases.json')

async function readData(): Promise<Showcase[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    return JSON.parse(raw) as Showcase[]
  } catch {
    return []
  }
}

async function writeData(data: Showcase[]): Promise<void> {
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
      updatedAt: now
    }
    data.push(item)
    await writeData(data)
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
