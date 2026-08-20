import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { appendServerAudit } from '@/lib/server-audit'
import { COMMERCE_SETTINGS_KEY, commerceSettingsSchema, normalizeCommerceSettings } from '@/lib/commerce-settings'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: COMMERCE_SETTINGS_KEY } })
    return NextResponse.json(normalizeCommerceSettings(row?.value))
  } catch {
    return NextResponse.json({ error: 'failed_to_read_settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  const parsed = commerceSettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_shipping_settings', issues: parsed.error.issues }, { status: 400 })
  }
  const body = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.keyValueSetting.findUnique({ where: { key: COMMERCE_SETTINGS_KEY } })
      await tx.keyValueSetting.upsert({
        where: { key: COMMERCE_SETTINGS_KEY },
        create: { key: COMMERCE_SETTINGS_KEY, value: body as Prisma.InputJsonValue },
        update: { value: body as Prisma.InputJsonValue },
      })
      await appendServerAudit(tx, request, actor, {
        action: 'settings.shipping_updated', entityType: 'setting', entityId: COMMERCE_SETTINGS_KEY,
        before: before?.value ?? null, after: body,
      })
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_save_settings' }, { status: 500 })
  }
}
