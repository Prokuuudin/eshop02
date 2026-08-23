import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { CUSTOMER_SEGMENTS, getCustomerPage, type CustomerRow, type CustomerSegment, type CustomerSort, type SortDirection } from '@/lib/admin/customer-segments'

export const runtime = 'nodejs'
export type { CustomerRow }

const SORTS: CustomerSort[] = ['lastOrderDate', 'totalSpent', 'totalOrders', 'email']
const DIRECTIONS: SortDirection[] = ['asc', 'desc']

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user || user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const params = request.nextUrl.searchParams
  const segmentValue = params.get('segment')
  const sortValue = params.get('sort')
  const directionValue = params.get('direction')
  const segment = CUSTOMER_SEGMENTS.includes(segmentValue as CustomerSegment) ? segmentValue as CustomerSegment : undefined
  const sort = SORTS.includes(sortValue as CustomerSort) ? sortValue as CustomerSort : 'lastOrderDate'
  const direction = DIRECTIONS.includes(directionValue as SortDirection) ? directionValue as SortDirection : 'desc'

  return NextResponse.json(await getCustomerPage({
    page: positiveInt(params.get('page'), 1, 1_000_000),
    pageSize: positiveInt(params.get('pageSize'), 50, 100),
    search: params.get('search')?.trim().slice(0, 100) || undefined,
    email: params.get('email')?.trim().slice(0, 320) || undefined,
    segment, sort, direction,
  }))
}
