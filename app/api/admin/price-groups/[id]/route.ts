import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import {
  updatePriceGroup,
  deletePriceGroup,
  setOverride,
  removeOverride,
} from '@/lib/price-groups-server-store'
import { priceGroupSchema, priceOverrideSchema, removeOverrideSchema } from '@/lib/price-groups-validation'

export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = await request.json()

    if (body.action === 'set_override') {
      const parsed = priceOverrideSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid_data' }, { status: 400 })
      const result = await setOverride(id, parsed.data.productId, parsed.data.price, { actor, request })
      return result.success
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: result.error }, { status: 500 })
    }

    if (body.action === 'remove_override') {
      const parsed = removeOverrideSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid_data' }, { status: 400 })
      const result = await removeOverride(id, parsed.data.productId, { actor, request })
      return result.success
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: result.error }, { status: 500 })
    }

    const parsed = priceGroupSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid_data' }, { status: 400 })
    const result = await updatePriceGroup(id, parsed.data, { actor, request })
    return result.success
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 500 })
  } catch {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const result = await deletePriceGroup(id, { actor, request })
    return result.success
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: result.error }, { status: 500 })
  } catch {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
}
