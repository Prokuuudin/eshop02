import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['approved', 'rejected'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.accessRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const body = (await req.json()) as {
      status?: string
      reviewNote?: string
      approvedTeamRole?: string
    }

    if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }

    const updated = await prisma.accessRequest.update({
      where: { id },
      data: {
        status: body.status,
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
        reviewedByEmail: user.email,
        reviewNote: body.reviewNote ?? null,
        approvedTeamRole: body.status === 'approved' ? (body.approvedTeamRole ?? 'viewer') : null,
      },
      select: {
        id: true, email: true, status: true, reviewedAt: true,
        reviewedByEmail: true, approvedTeamRole: true, reviewNote: true,
      },
    })

    return NextResponse.json({ request: updated })
  } catch (e) {
    console.error('[admin/access-requests/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
