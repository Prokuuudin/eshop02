import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// Mirrors the clamp in the sibling collection route - see comment there.
const clampDiscount = (value: unknown): number => Math.min(100, Math.max(0, Number(value) || 0))
const clampNonNegative = (value: unknown): number => Math.max(0, Number(value) || 0)
const stringList = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.map(String).map((v) => v.trim()).filter(Boolean))] : []

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = (await request.json()) as {
      code?: string; discount?: number; minOrder?: number;
      maxUses?: number | null; usedCount?: number; expiresAt?: string | null;
      active?: boolean; description?: string
      discountType?: string; discountValue?: number; maxDiscount?: number | null; minEligibleAmount?: number;
      perUserLimit?: number | null; startsAt?: string | null; appliesTo?: string; productIds?: string[];
      brands?: string[]; categories?: string[]; excludedProductIds?: string[]; excludeSaleItems?: boolean; firstOrderOnly?: boolean
      subcategories?: string[]
    }

    const existing = await prisma.promoCode.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const scope = body.appliesTo ?? existing.appliesTo
    const scopeValues = scope === 'products' ? (body.productIds === undefined ? existing.productIds : stringList(body.productIds))
      : scope === 'brands' ? (body.brands === undefined ? existing.brands : stringList(body.brands))
      : scope === 'categories' ? (body.categories === undefined ? existing.categories : stringList(body.categories))
      : scope === 'rules' ? [...(body.brands === undefined ? existing.brands : stringList(body.brands)), ...(body.categories === undefined ? existing.categories : stringList(body.categories)), ...(body.subcategories === undefined ? existing.subcategories : stringList(body.subcategories))] : ['all']
    if (scopeValues.length === 0) return NextResponse.json({ error: 'scope_required' }, { status: 400 })

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.promoCode.update({ where: { id }, data: {
        ...(body.code !== undefined && { code: body.code.toUpperCase().trim() }),
        ...(body.discount !== undefined && { discount: clampDiscount(body.discount) }),
        ...(body.discountType !== undefined && { discountType: body.discountType === 'fixed' ? 'fixed' : 'percentage' }),
        ...(body.discountValue !== undefined && { discountValue: body.discountType === 'fixed' ? clampNonNegative(body.discountValue) : clampDiscount(body.discountValue), discount: clampDiscount(body.discountValue) }),
        ...(body.maxDiscount !== undefined && { maxDiscount: body.maxDiscount == null ? null : clampNonNegative(body.maxDiscount) }),
        ...(body.minOrder !== undefined && { minOrder: clampNonNegative(body.minOrder) }),
        ...(body.minEligibleAmount !== undefined && { minEligibleAmount: clampNonNegative(body.minEligibleAmount) }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses !== null ? Math.max(0, Number(body.maxUses) || 0) : null }),
        ...(body.perUserLimit !== undefined && { perUserLimit: body.perUserLimit == null ? null : Math.max(1, Math.floor(Number(body.perUserLimit) || 1)) }),
        ...(body.usedCount !== undefined && { usedCount: clampNonNegative(body.usedCount) }),
        ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.appliesTo !== undefined && { appliesTo: ['all', 'products', 'brands', 'categories', 'rules'].includes(body.appliesTo) ? body.appliesTo : 'all' }),
        ...(body.productIds !== undefined && { productIds: stringList(body.productIds) }),
        ...(body.brands !== undefined && { brands: stringList(body.brands) }),
        ...(body.categories !== undefined && { categories: stringList(body.categories) }),
        ...(body.subcategories !== undefined && { subcategories: stringList(body.subcategories) }),
        ...(body.excludedProductIds !== undefined && { excludedProductIds: stringList(body.excludedProductIds) }),
        ...(body.excludeSaleItems !== undefined && { excludeSaleItems: body.excludeSaleItems }),
        ...(body.firstOrderOnly !== undefined && { firstOrderOnly: body.firstOrderOnly }),
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
