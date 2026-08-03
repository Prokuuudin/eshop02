import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

const SHIPPING_KEY = 'shipping-settings'

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: SHIPPING_KEY } })
    if (!row) return NextResponse.json({})
    return NextResponse.json(row.value)
  } catch {
    return NextResponse.json({ error: 'failed_to_read_settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body: unknown = await request.json()
    await prisma.$transaction(async (tx) => {
      const before = await tx.keyValueSetting.findUnique({ where: { key: SHIPPING_KEY } })
      await tx.keyValueSetting.upsert({
        where: { key: SHIPPING_KEY },
        create: { key: SHIPPING_KEY, value: body as Prisma.InputJsonValue },
        update: { value: body as Prisma.InputJsonValue },
      })
      await appendServerAudit(tx, request, actor, {
        action: 'settings.shipping_updated', entityType: 'setting', entityId: SHIPPING_KEY,
        before: before?.value ?? null, after: body,
      })
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_save_settings' }, { status: 500 })
  }
}
