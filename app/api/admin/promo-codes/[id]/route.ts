import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = (await request.json()) as {
      code?: string; discount?: number; minOrder?: number;
      maxUses?: number | null; usedCount?: number; expiresAt?: string | null;
      active?: boolean; description?: string
    }

    const existing = await prisma.promoCode.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.promoCode.update({ where: { id }, data: {
        ...(body.code !== undefined && { code: body.code.toUpperCase().trim() }),
        ...(body.discount !== undefined && { discount: Number(body.discount) }),
        ...(body.minOrder !== undefined && { minOrder: Number(body.minOrder) }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses !== null ? Number(body.maxUses) : null }),
        ...(body.usedCount !== undefined && { usedCount: Number(body.usedCount) }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.description !== undefined && { description: body.description }),
      } })
      await appendServerAudit(tx, request, actor, { action: 'promo.updated', entityType: 'promo', entityId: id, entityTitle: after.code, before: existing, after })
      return after
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const existing = await prisma.promoCode.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    await prisma.$transaction(async (tx) => {
      await tx.promoCode.delete({ where: { id } })
      await appendServerAudit(tx, request, actor, { action: 'promo.deleted', entityType: 'promo', entityId: id, entityTitle: existing.code, before: existing })
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
