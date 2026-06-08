import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.stockNotification.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (sub.userId !== user.id && sub.email !== user.email && user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await prisma.stockNotification.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[stock-notify/:id DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
