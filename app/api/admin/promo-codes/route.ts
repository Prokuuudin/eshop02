import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await prisma.promoCode.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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

    const item = await prisma.promoCode.create({
      data: {
        id: `pc-${Date.now()}`,
        code,
        discount: Number(body.discount) || 0,
        minOrder: Number(body.minOrder) || 0,
        maxUses: body.maxUses !== null && body.maxUses !== undefined ? Number(body.maxUses) : null,
        usedCount: Number(body.usedCount) || 0,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        active: body.active ?? true,
        description: body.description ?? '',
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
