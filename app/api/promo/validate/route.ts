import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { evaluatePromoCode, resolveLineItems, type LineItemInput } from '@/lib/server-pricing'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { code, items, email } = (await req.json()) as { code?: string; items?: LineItemInput[]; email?: string }
    if (!code?.trim()) return NextResponse.json({ valid: false, error: 'code_required' })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ valid: false, error: 'items_required' })
    const [resolved, user] = await Promise.all([resolveLineItems(items, prisma), getServerUser()])
    const result = await evaluatePromoCode(code, resolved, { userId: user?.id, email: user?.email ?? email }, prisma)
    return NextResponse.json({ ...result, error: result.reason })
  } catch {
    return NextResponse.json({ valid: false, error: 'server_error' }, { status: 500 })
  }
}
