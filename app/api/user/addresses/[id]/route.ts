import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const addr = await prisma.savedAddress.findUnique({ where: { id } })
    if (!addr) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (addr.email !== user.email && user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await prisma.savedAddress.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError("[user/addresses/:id DELETE]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


