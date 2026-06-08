import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ user: null })

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ user: null })
    }

    return NextResponse.json({ user: mapDbToServerUser(session.user) })
  } catch (e) {
    console.error('[auth/me]', e)
    return NextResponse.json({ user: null })
  }
}
