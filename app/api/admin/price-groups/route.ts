import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { createPriceGroup, readPriceGroupsData } from '@/lib/price-groups-server-store'
import { priceGroupSchema } from '@/lib/price-groups-validation'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await readPriceGroupsData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const parsed = priceGroupSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid_data' }, { status: 400 })
    }
    const result = await createPriceGroup(parsed.data)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json(result.group, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
