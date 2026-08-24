import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission } from '@/lib/server-auth'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireAdminPermission('customers.read')
    if (actor instanceof NextResponse) return actor

    const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
      : DEFAULT_LIMIT

    const status = req.nextUrl.searchParams.get('status')
    const where = status === 'all'
      ? {}
      : status === 'answered'
        ? { answeredAt: { not: null } }
        : { answeredAt: null }
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          message: true,
          answeredAt: true,
          createdAt: true,
        },
      }),
      prisma.contactMessage.count({ where }),
    ])

    return NextResponse.json({ messages, total })
  } catch (error) {
    logApiError('[admin/contact-messages GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireAdminPermission('customers.read')
    if (actor instanceof NextResponse) return actor

    const body = (await req.json()) as { id?: unknown; answered?: unknown }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

    const answered = body.answered !== false
    const result = await prisma.contactMessage.updateMany({
      where: { id },
      data: answered
        ? { answeredAt: new Date(), answeredById: actor.id }
        : { answeredAt: null, answeredById: null },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
    }

    return NextResponse.json({ id, answered })
  } catch (error) {
    logApiError('[admin/contact-messages PATCH]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
