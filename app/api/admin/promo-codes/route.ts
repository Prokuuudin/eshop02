import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

// The admin UI enforces 1-100 client-side only - a direct API call could
// otherwise set discount=500 and, combined with server-pricing's discount
// math, floor an order's total to €0.
const clampDiscount = (value: unknown): number => Math.min(100, Math.max(0, Number(value) || 0))
const clampNonNegative = (value: unknown): number => Math.max(0, Number(value) || 0)

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const data = await prisma.promoCode.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as {
      code?: string; discount?: number; minOrder?: number;
      maxUses?: number | null; usedCount?: number; expiresAt?: string | null;
      active?: boolean; description?: string
    }
    const code = (body.code ?? '').toUpperCase().trim()
    if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 })

    const existing = await prisma.promoCode.findUnique({ where: { code } })
    if (existing) return NextResponse.json({ error: 'duplicate_code' }, { status: 409 })

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.promoCode.create({ data: {
        id: `pc-${Date.now()}`,
        code,
        discount: clampDiscount(body.discount),
        minOrder: clampNonNegative(body.minOrder),
        maxUses: body.maxUses !== null && body.maxUses !== undefined ? Math.max(0, Number(body.maxUses) || 0) : null,
        usedCount: clampNonNegative(body.usedCount),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        active: body.active ?? true,
        description: body.description ?? '',
      } })
      await appendServerAudit(tx, request, actor, { action: 'promo.created', entityType: 'promo', entityId: created.id, entityTitle: created.code, after: created })
      return created
    })
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
