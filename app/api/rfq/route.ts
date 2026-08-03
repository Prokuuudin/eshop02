import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const skip = parseInt(searchParams.get('skip') || '0', 10) || 0
    const take = Math.min(200, parseInt(searchParams.get('take') || '100', 10) || 100)

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
    console.error('[rfq GET]', e)
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

    const rfq = await prisma.rFQRequest.upsert({
      where: { id },
      create: {
        id,
        companyId: resolvedCompanyId,
        items,
        notes: notes ?? '',
        status: 'pending',
        timeline: timeline ?? [{ at: new Date().toISOString(), type: 'created' }],
        createdByUserId: user.id,
      },
      update: {},
    })

    return NextResponse.json({
      request: { ...rfq, createdAt: rfq.createdAt.toISOString(), updatedAt: rfq.updatedAt.toISOString() },
    })
  } catch (e) {
    console.error('[rfq POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
