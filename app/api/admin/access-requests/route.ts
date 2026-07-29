import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') || undefined
    const skip = parseInt(searchParams.get('skip') || '0', 10) || 0
    const take = Math.min(200, parseInt(searchParams.get('take') || '100', 10) || 100)

    const where = status ? { status } : {}
    const [requests, total] = await Promise.all([
      prisma.accessRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take,
        // Never expose passwordHash
        select: {
          id: true, email: true, name: true, phone: true,
          companyId: true, companyName: true, cardNumber: true,
          status: true, requestedAt: true, reviewedAt: true,
          reviewedByUserId: true, reviewedByEmail: true,
          approvedTeamRole: true, reviewNote: true,
          requestType: true, certificateName: true, message: true, language: true,
        },
      }),
      prisma.accessRequest.count({ where }),
    ])

    return NextResponse.json({ requests, total })
  } catch (e) {
    console.error('[admin/access-requests GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
