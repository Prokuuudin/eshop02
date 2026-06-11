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

    const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined
    if (newEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    // Only safe personal fields — never platformRole, companyId, approvalRequired etc.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name !== undefined ? (body.name ?? null) : undefined,
        email: newEmail !== undefined && newEmail !== user.email ? newEmail : undefined,
        phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
        avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl ?? null) : undefined,
        cardNumber: body.cardNumber !== undefined ? (String(body.cardNumber).trim() || null) : undefined,
      },
    })

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
        cardNumber: updated.cardNumber,
      },
    })
  } catch (e: any) {
    if (e?.code === 'P2002' && e?.meta?.target?.includes('email')) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    }
    console.error('[user/profile PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
