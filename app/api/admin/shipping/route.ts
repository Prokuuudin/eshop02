import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

const SHIPPING_KEY = 'shipping-settings'

const deliveryOptionSchema = z.object({
  enabled: z.boolean(),
  price: z.number().finite().min(0).max(10_000),
  freeFrom: z.number().finite().min(0).max(1_000_000),
  label: z.string().trim().min(1).max(100),
})

const paymentOptionSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(100),
})

const shippingSettingsSchema = z.object({
  delivery: z.object({
    courier: deliveryOptionSchema,
    pickup: deliveryOptionSchema,
    post: deliveryOptionSchema,
  }),
  payment: z.object({
    card: paymentOptionSchema,
    cash: paymentOptionSchema,
    online: paymentOptionSchema,
    invoice: paymentOptionSchema,
  }),
}).strict()

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

  const parsed = shippingSettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_shipping_settings', issues: parsed.error.issues }, { status: 400 })
  }
  const body = parsed.data

  try {
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
