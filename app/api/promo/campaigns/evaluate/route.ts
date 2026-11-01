import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluatePromoCampaigns } from '@/lib/promo-campaigns'
import { getServerUser } from '@/lib/server-auth'
import { resolveLineItems, type LineItemInput } from '@/lib/server-pricing'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<Response> {
  // eligibleAmount/discount are derived from B2B catalog prices, which guests must not
  // learn — not even indirectly. Authorize before any pricing work.
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as { items?: LineItemInput[] }
    const items = await resolveLineItems(Array.isArray(body.items) ? body.items : [], prisma)
    return NextResponse.json(await evaluatePromoCampaigns(items, prisma))
  } catch {
    return NextResponse.json({ error: 'failed_to_evaluate' }, { status: 400 })
  }
}
