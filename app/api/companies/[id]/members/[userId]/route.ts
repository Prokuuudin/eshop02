import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id: companyId, userId } = await params
    const { role } = await req.json()

    const member = await prisma.companyMember.update({
      where: { companyId_userId: { companyId, userId } },
      data: { role },
    })

    return NextResponse.json({ member })
  } catch (e) {
    console.error('[companies/:id/members/:userId PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id: companyId, userId } = await params
    await prisma.companyMember.deleteMany({ where: { companyId, userId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[companies/:id/members/:userId DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
