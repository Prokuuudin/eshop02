import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import type { CheckoutProfile } from '@/lib/auth-types'
import { LEGAL_ADDRESS_MAX_LENGTH } from '@/lib/legal-details-limits'

// personalCode and invoicePersonalCode are excluded: invoice identity belongs
// only to a specific order invoice, never to a reusable customer profile.
const checkoutProfileFields = ['companyName', 'regNumber', 'vatNumber', 'legalAddress', 'bankName', 'iban', 'firstName', 'lastName', 'phone', 'address', 'city', 'postalCode'] as const

function parseCheckoutProfile(value: unknown): CheckoutProfile | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const customerType = source.customerType === 'company' ? 'company' : 'individual'
  const result = { customerType } as CheckoutProfile
  for (const field of checkoutProfileFields) {
    const fieldValue = source[field]
    const maxLength = field === 'legalAddress' ? LEGAL_ADDRESS_MAX_LENGTH : 300
    result[field] = typeof fieldValue === 'string' ? fieldValue.trim().slice(0, maxLength) : ''
  }
  return result
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
    const checkoutProfile = parseCheckoutProfile(body.checkoutProfile)
    const customerType = checkoutProfile?.customerType
    const registrationNumber = customerType === 'company'
      ? checkoutProfile?.regNumber.replace(/\D/gu, '') || null
      : null

    // The e-mail changes only through /api/user/email-change (current password + a link sent to
    // the new address). A client resending the unchanged address with the profile is harmless.
    if (typeof body.email === 'string') {
      const requested = body.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requested)) {
        return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
      }
      if (requested !== user.email.toLowerCase()) {
        return NextResponse.json({ error: 'email_change_requires_confirmation' }, { status: 409 })
      }
    }

    // Only profile fields נnever platformRole, companyId, approvalRequired etc.
    // cardNumber is deliberately NOT accepted here: it is a login identifier assigned at
    // registration (checked for uniqueness in auth/register-card). Letting a client set an
    // arbitrary card here would collide with a real customer's card / corrupt data.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name !== undefined ? (body.name ?? null) : undefined,
        phone: body.phone !== undefined ? (body.phone ?? null) : undefined,
        avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl ?? null) : undefined,
        checkoutProfile,
        customerType,
        companyName: customerType === 'company' ? checkoutProfile?.companyName || null : null,
        registrationNumber,
        vatNumber: customerType === 'company' ? checkoutProfile?.vatNumber || null : null,
        legalAddress: customerType === 'company' ? checkoutProfile?.legalAddress || null : null,
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
        checkoutProfile: updated.checkoutProfile,
      },
    })
  } catch (e: unknown) {
    logApiError("[user/profile PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


