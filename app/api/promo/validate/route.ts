import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { code, orderAmount } = (await req.json()) as { code?: string; orderAmount?: number }
    if (!code?.trim()) return NextResponse.json({ valid: false, error: 'code_required' })

    const promo = await prisma.promoCode.findFirst({
      where: { code: code.toUpperCase().trim(), active: true },
    })

    if (!promo) return NextResponse.json({ valid: false })
    if (promo.minOrder && (orderAmount ?? 0) < promo.minOrder)
      return NextResponse.json({ valid: false, error: 'min_order' })
    if (promo.expiresAt && new Date() > promo.expiresAt)
      return NextResponse.json({ valid: false, error: 'expired' })
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses)
      return NextResponse.json({ valid: false, error: 'max_uses' })

    return NextResponse.json({ valid: true, discount: promo.discount, code: promo.code })
  } catch {
    return NextResponse.json({ valid: false, error: 'server_error' }, { status: 500 })
  }
}
