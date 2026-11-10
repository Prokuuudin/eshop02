import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { PromoCampaign } from '@/lib/promo-campaigns'
import { createAdminCampaign, getAdminCampaigns } from '@/lib/campaigns-server-store'

export const runtime = 'nodejs'

function revalidateCampaigns(): void {
  revalidateTag('storefront-sale-products', { expire: 0 })
  revalidateTag('storefront-bestsellers', { expire: 0 })
  revalidatePath('/[lang]', 'layout')
}

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const data = await getAdminCampaigns()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'>
    const result = await createAdminCampaign(body, { actor, request })
    if (!result.ok) return NextResponse.json(result.body, { status: result.status })
    revalidateCampaigns()
    return NextResponse.json(result.value, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
