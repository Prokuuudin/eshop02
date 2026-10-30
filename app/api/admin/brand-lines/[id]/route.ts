import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { brandLineErrorResponse, getBrandLineDetail, updateBrandLine } from '@/lib/brand-lines/brand-line-admin'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context): Promise<Response> {
  const actor = await requireAdminPermission('catalog.read')
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await getBrandLineDetail((await params).id))
  } catch (error) {
    const mapped = brandLineErrorResponse(error)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    throw error
  }
}

export async function PATCH(request: NextRequest, { params }: Context): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await updateBrandLine(request, actor, (await params).id, await request.json()))
  } catch (error) {
    const mapped = brandLineErrorResponse(error)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    throw error
  }
}
