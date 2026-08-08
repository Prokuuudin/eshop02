import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'

export async function PATCH(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

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

    if (newEmail !== undefined && newEmail !== user.email.toLowerCase()) {
      const emailOwner = await prisma.user.findFirst({
        where: {
          email: { equals: newEmail, mode: 'insensitive' },
          NOT: { id: user.id },
        },
        select: { id: true },
      })
      if (emailOwner) {
        return NextResponse.json({ error: 'email_taken' }, { status: 409 })
      }

      // SavedAddress has no userId נit's keyed by email alone. Without this check, self-service
      // email change is an IDOR: set your email to someone else's, then GET /api/user/addresses
      // returns their saved name/phone/address. Guest orders (order.userId === null) have the
      // same email-only exposure via canAccessOrder's legacy fallback and are NOT covered here ׊      // that gap is still open.
      const conflictingAddress = await prisma.savedAddress.findFirst({
        where: { email: { equals: newEmail, mode: 'insensitive' } },
        select: { id: true },
      })
      if (conflictingAddress) {
        return NextResponse.json({ error: 'email_taken' }, { status: 409 })
      }
    }

    // Only profile fields נnever platformRole, companyId, approvalRequired etc.
    // cardNumber is deliberately NOT accepted here: it is a login identifier assigned at
    // registration (checked for uniqueness in auth/register-card). Letting a client set an
    // arbitrary card here would collide with a real customer's card / corrupt data.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        name: body.name !== undefined ? (body.name ?? null) : undefined,
        phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
        avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl ?? null) : undefined,
      },
    })

    // These are denormalized convenience fields, not the account identity. A stale legacy
    // record must not roll back an otherwise valid profile update.
    if (newEmail !== undefined && newEmail !== user.email) {
      try {
        await prisma.companyMember.updateMany({ where: { userId: user.id }, data: { email: newEmail } })
        await prisma.savedAddress.updateMany({ where: { email: user.email }, data: { email: newEmail } })
        await prisma.productSubscription.updateMany({ where: { userId: user.id }, data: { userEmail: newEmail } })
      } catch (relatedUpdateError) {
        logApiError("[user/profile PATCH] related email sync failed", relatedUpdateError)
      }
    }

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
  } catch (e: unknown) {
    const databaseError = e as { code?: string }
    if (databaseError.code === 'P2002') {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    }
    logApiError("[user/profile PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





