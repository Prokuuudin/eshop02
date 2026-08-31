import { randomUUID, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { logApiError } from '@/lib/observability'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const configuredToken = process.env.ADMIN_SETUP_TOKEN?.trim() ?? ''
    if (process.env.NODE_ENV === 'production' && !configuredToken) {
      return NextResponse.json({ error: 'admin_setup_not_configured' }, { status: 503 })
    }
    if (configuredToken) {
      const suppliedToken = req.headers.get('x-admin-setup-token') ?? ''
      const configuredBytes = Buffer.from(configuredToken)
      const suppliedBytes = Buffer.from(suppliedToken)
      if (configuredBytes.length !== suppliedBytes.length || !timingSafeEqual(configuredBytes, suppliedBytes)) {
        return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 })
      }
    }

    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!email || !email.includes('@') || email.length > 254 || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    }

    // Avoid an attacker forcing repeated bcrypt work after bootstrap is already
    // complete. The Serializable transaction repeats this check to close races.
    if (await prisma.user.count({ where: { platformRole: 'admin' } })) {
      return NextResponse.json({ error: 'admin_already_exists' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.$transaction(async (tx) => {
      if (await tx.user.count({ where: { platformRole: 'admin' } })) return null
      return tx.user.create({
        data: {
          id: randomUUID(), email, passwordHash, name: name || 'Administrator',
          platformRole: 'admin', auditLoggingEnabled: true,
        },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!user) return NextResponse.json({ error: 'admin_already_exists' }, { status: 409 })

    const token = await createSession(user.id)
    const res = NextResponse.json({ user: mapDbToServerUser(user) }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      maxAge: 60 * 60 * 24,
    })
    return res
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
      return NextResponse.json({ error: 'admin_already_exists' }, { status: 409 })
    }
    logApiError('[auth/admin-setup]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
