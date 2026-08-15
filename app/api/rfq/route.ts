import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { parseOffsetPagination } from '@/lib/pagination'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const { skip, take } = parseOffsetPagination(searchParams)

    const where = hasAdminPermission(user, 'rfq.read')
      ? {}
      : user.companyId
        ? { companyId: user.companyId }
        : { companyId: '__none__' }

    const [requests, total] = await Promise.all([
      prisma.rFQRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.rFQRequest.count({ where }),
    ])

    return NextResponse.json({
      requests: requests.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
    })
  } catch (e) {
    logApiError("[rfq GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, companyId, items, notes, timeline } = body

    if (!id || !items) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Non-admins can only create for their own company
    const resolvedCompanyId = hasAdminPermission(user, 'rfq.quote')
      ? (companyId ?? user.companyId ?? '')
      : (user.companyId ?? '')

    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'company_required' }, { status: 400 })
    }

    // The id is client-supplied (offline-first retry pattern). Never let a
    // colliding id upsert into - or read back - another company's RFQ,
    // including its quote pricing.
    const existing = await prisma.rFQRequest.findUnique({ where: { id } })
    if (existing) {
      if (existing.companyId !== resolvedCompanyId && !hasAdminPermission(user, 'rfq.read')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      return NextResponse.json({
        request: { ...existing, createdAt: existing.createdAt.toISOString(), updatedAt: existing.updatedAt.toISOString() },
      })
    }

    let rfq
    try {
      rfq = await prisma.rFQRequest.create({
        data: {
          id,
          companyId: resolvedCompanyId,
          items,
          notes: notes ?? '',
          status: 'pending',
          timeline: timeline ?? [{ at: new Date().toISOString(), type: 'created' }],
          createdByUserId: user.id,
        },
      })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        const race = await prisma.rFQRequest.findUniqueOrThrow({ where: { id } })
        if (race.companyId !== resolvedCompanyId && !hasAdminPermission(user, 'rfq.read')) {
          return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        }
        rfq = race
      } else {
        throw e
      }
    }

    return NextResponse.json({
      request: { ...rfq, createdAt: rfq.createdAt.toISOString(), updatedAt: rfq.updatedAt.toISOString() },
    })
  } catch (e) {
    logApiError("[rfq POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


