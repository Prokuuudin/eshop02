import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export const runtime = 'nodejs'

const SHIPPING_KEY = 'shipping-settings'

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: SHIPPING_KEY } })
    if (!row) return NextResponse.json({})
    return NextResponse.json(row.value)
  } catch {
    return NextResponse.json({ error: 'failed_to_read_settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body: unknown = await request.json()
    await prisma.keyValueSetting.upsert({
      where: { key: SHIPPING_KEY },
      create: { key: SHIPPING_KEY, value: body as Prisma.InputJsonValue },
      update: { value: body as Prisma.InputJsonValue },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_save_settings' }, { status: 500 })
  }
}
