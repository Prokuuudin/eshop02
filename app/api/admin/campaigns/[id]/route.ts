import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { PromoCampaign } from '@/lib/promo-campaigns'
import { deleteAdminCampaign, updateAdminCampaign } from '@/lib/campaigns-server-store'

export const runtime = 'nodejs'

function revalidateCampaigns(): void {
  revalidateTag('storefront-sale-products', { expire: 0 })
  revalidateTag('storefront-bestsellers', { expire: 0 })
  revalidatePath('/[lang]', 'layout')
}

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = (await request.json()) as Partial<PromoCampaign>
    const result = await updateAdminCampaign(id, body, { actor, request })
    if (!result.ok) return NextResponse.json(result.body, { status: result.status })
    if (result.changed) revalidateCampaigns()
    return NextResponse.json(result.value)
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const result = await deleteAdminCampaign(id, { actor, request })
    if (!result.ok) return NextResponse.json(result.body, { status: result.status })
    revalidateCampaigns()
    return NextResponse.json(result.value)
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
