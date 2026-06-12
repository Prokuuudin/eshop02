import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { getPriceGroups, createPriceGroup, readPriceGroupsData } from '@/lib/price-groups-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await readPriceGroupsData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = await request.json()
    const { name, description, multiplier, color } = body
    if (!name || multiplier == null) {
      return NextResponse.json({ error: 'name_and_multiplier_required' }, { status: 400 })
    }
    const result = await createPriceGroup({
      name,
      description: description ?? '',
      multiplier: Number(multiplier),
      color: color ?? '#6b7280',
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json(result.group, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
