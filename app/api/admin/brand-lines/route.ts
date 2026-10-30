import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { brandLineErrorResponse, createBrandLine, listBrandLines } from '@/lib/brand-lines/brand-line-admin'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const actor = await requireAdminPermission('catalog.read')
  if (actor instanceof NextResponse) return actor
  return NextResponse.json(await listBrandLines())
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await createBrandLine(request, actor, await request.json()), { status: 201 })
  } catch (error) {
    const mapped = brandLineErrorResponse(error)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    throw error
  }
}
