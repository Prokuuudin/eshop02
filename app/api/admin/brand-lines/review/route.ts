import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { listReviewItems } from '@/lib/brand-lines/brand-line-admin'

export const runtime = 'nodejs'

const STATUSES = new Set(['open', 'resolved', 'dismissed'])

export async function GET(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.read')
  if (actor instanceof NextResponse) return actor
  const status = request.nextUrl.searchParams.get('status') ?? 'open'
  const reason = request.nextUrl.searchParams.get('reason') ?? undefined
  if (!STATUSES.has(status) || (reason && !/^[a-z_]{3,40}$/u.test(reason))) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  return NextResponse.json({ items: await listReviewItems({ status, reason }) })
}
