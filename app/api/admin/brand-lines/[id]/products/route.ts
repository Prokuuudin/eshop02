import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { revalidateBrandLineStorefront } from '@/lib/brand-lines/brand-line-cache'
import { brandLineErrorResponse, setProductMembership } from '@/lib/brand-lines/brand-line-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const membership = await setProductMembership(request, actor, (await params).id, await request.json())
    // After commit only: a failed change throws above and never reaches this line.
    revalidateBrandLineStorefront()
    return NextResponse.json(membership)
  } catch (error) {
    const mapped = brandLineErrorResponse(error)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    throw error
  }
}
