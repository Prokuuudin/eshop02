import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const rows = await prisma.userNotification.findMany({
      where: {
        userId: user.id,
        appDelivered: false,
        channel: { in: ['app', 'both'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, type: true, title: true, message: true, link: true },
    })

    if (rows.length > 0) {
      await prisma.userNotification.updateMany({
        where: { userId: user.id, id: { in: rows.map((r) => r.id) } },
        data: { appDelivered: true },
      })
    }

    const notifications = rows.map((r) => ({
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link ?? undefined,
    }))

    return NextResponse.json({ notifications })
  } catch (err) {
    logApiError("[notifications/inbox]", err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

