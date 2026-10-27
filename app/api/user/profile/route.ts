import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import type { CheckoutProfile } from '@/lib/auth-types'
import { readCustomerCanonical, type CustomerUserRow } from '@/lib/admin/customer-edit-model'

// personalCode and invoicePersonalCode are excluded: invoice identity belongs
// only to a specific order invoice, never to a reusable customer profile.
const checkoutProfileFields = ['companyName', 'regNumber', 'vatNumber', 'legalAddress', 'bankName', 'iban', 'firstName', 'lastName', 'phone', 'address', 'city', 'postalCode'] as const

const PROFILE_SELECT = {
  id: true, email: true, name: true, phone: true, avatarUrl: true, cardNumber: true, customerType: true,
  companyName: true, registrationNumber: true, vatNumber: true, legalAddress: true, checkoutProfile: true, updatedAt: true,
} as const

class ProfileConflictError extends Error {}
class EmailTakenError extends Error {}

function parseCheckoutProfile(value: unknown): CheckoutProfile | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const customerType = source.customerType === 'company' ? 'company' : 'individual'
  const result = { customerType } as CheckoutProfile
  for (const field of checkoutProfileFields) {
    const fieldValue = source[field]
    result[field] = typeof fieldValue === 'string' ? fieldValue.trim().slice(0, 300) : ''
  }
  return result
}

/**
 * The account form's view of the profile. Requisites come from the User columns (the source
 * of truth staff edit), so the form never starts from a stale checkoutProfile mirror.
 */
function profileView(user: CustomerUserRow & { avatarUrl: string | null }) {
  const canonical = readCustomerCanonical(user)
  const checkoutProfile: CheckoutProfile = {
    customerType: canonical.customerType,
    companyName: canonical.companyName,
    regNumber: canonical.registrationNumber,
    vatNumber: canonical.vatNumber,
    legalAddress: canonical.legalAddress,
    bankName: canonical.bankName,
    iban: canonical.iban,
    firstName: canonical.firstName,
    lastName: canonical.lastName,
    phone: canonical.phone,
    address: canonical.address,
    city: canonical.city,
    postalCode: canonical.postalCode,
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: canonical.phone || null,
    avatarUrl: user.avatarUrl,
    cardNumber: user.cardNumber,
    checkoutProfile,
    updatedAt: user.updatedAt.toISOString(),
  }
}

// GET /api/user/profile — fresh profile plus the version (`updatedAt`) the edit form must echo back.
export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: PROFILE_SELECT })
    if (!row) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    return NextResponse.json({ profile: profileView(row) })
  } catch (e) {
    logApiError("[user/profile GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

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
    // The form must prove it was built from the current profile: a save based on an older
    // read (e.g. before staff corrected the requisites) is rejected instead of silently
    // overwriting the newer data.
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? new Date(body.expectedUpdatedAt) : null
    if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
      return NextResponse.json({ error: 'profile_conflict' }, { status: 409 })
    }

    const checkoutProfile = parseCheckoutProfile(body.checkoutProfile)
    const customerType = checkoutProfile?.customerType
    const registrationNumber = customerType === 'company'
      ? checkoutProfile?.regNumber.replace(/\D/gu, '') || null
      : null

    const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined
    if (newEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    const emailChanged = newEmail !== undefined && newEmail !== user.email.toLowerCase()

    const updated = await prisma.$transaction(async (tx) => {
      if (emailChanged) {
        const emailOwner = await tx.user.findFirst({
          where: {
            email: { equals: newEmail, mode: 'insensitive' },
            NOT: { id: user.id },
          },
          select: { id: true },
        })
        if (emailOwner) throw new EmailTakenError()

        // Email-keyed data must not change hands through a self-service email change: legacy
        // SavedAddress rows and guest orders (order.userId === null) are readable by whoever
        // holds their email (GET /api/user/addresses legacy rows, canAccessOrder, /api/orders/my).
        const conflictingAddress = await tx.savedAddress.findFirst({
          where: { email: { equals: newEmail, mode: 'insensitive' } },
          select: { id: true },
        })
        const guestOrder = await tx.order.findFirst({
          where: { userId: null, email: { equals: newEmail, mode: 'insensitive' } },
          select: { id: true },
        })
        if (conflictingAddress || guestOrder) throw new EmailTakenError()
      }

      // Only profile fields — never platformRole, companyId, approvalRequired etc.
      // cardNumber is deliberately NOT accepted here: it is a login identifier assigned at
      // registration (checked for uniqueness in auth/register-card). Letting a client set an
      // arbitrary card here would collide with a real customer's card / corrupt data.
      // Requisite columns follow checkoutProfile only when the form actually sent it.
      const result = await tx.user.updateMany({
        where: { id: user.id, updatedAt: expectedUpdatedAt },
        data: {
          email: newEmail,
          name: body.name !== undefined ? (body.name ?? null) : undefined,
          phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
          avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl ?? null) : undefined,
          ...(checkoutProfile ? {
            checkoutProfile,
            customerType,
            companyName: customerType === 'company' ? checkoutProfile.companyName || null : null,
            registrationNumber,
            vatNumber: customerType === 'company' ? checkoutProfile.vatNumber || null : null,
            legalAddress: customerType === 'company' ? checkoutProfile.legalAddress || null : null,
          } : {}),
        },
      })
      if (result.count !== 1) throw new ProfileConflictError()

      // Denormalized convenience copies of the email, kept in the same transaction.
      if (emailChanged) {
        await tx.companyMember.updateMany({ where: { userId: user.id }, data: { email: newEmail } })
        await tx.savedAddress.updateMany({ where: { userId: user.id }, data: { email: newEmail } })
      }
      return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: PROFILE_SELECT })
    })

    return NextResponse.json({ user: profileView(updated) })
  } catch (e: unknown) {
    if (e instanceof ProfileConflictError) return NextResponse.json({ error: 'profile_conflict' }, { status: 409 })
    if (e instanceof EmailTakenError) return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    const databaseError = e as { code?: string }
    if (databaseError.code === 'P2002') {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    }
    if (databaseError.code === 'P2034') {
      return NextResponse.json({ error: 'profile_conflict' }, { status: 409 })
    }
    logApiError("[user/profile PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
