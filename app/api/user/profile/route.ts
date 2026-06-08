import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser, SESSION_COOKIE } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    const user = await getServerUser()
    if (!user || !token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // Only safe personal fields — never platformRole, companyId, approvalRequired etc.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name !== undefined ? (body.name ?? null) : undefined,
        phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
        avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl ?? null) : undefined,
        cardNumber: body.cardNumber !== undefined ? (String(body.cardNumber).trim() || null) : undefined,
      },
    })

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
        cardNumber: updated.cardNumber,
      },
    })
  } catch (e) {
    console.error('[user/profile PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
