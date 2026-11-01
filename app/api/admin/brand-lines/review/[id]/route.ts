import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { actOnReviewItem, brandLineErrorResponse } from '@/lib/brand-lines/brand-line-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await actOnReviewItem(request, actor, (await params).id, await request.json()))
  } catch (error) {
    const mapped = brandLineErrorResponse(error)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    throw error
  }
}
