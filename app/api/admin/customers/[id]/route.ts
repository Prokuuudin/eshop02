import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { guardOrigin } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyAdminStepUp } from '@/lib/admin-step-up'
import { applyCustomerEdit, customerEditSchema, CustomerEditError, loadCustomerRecord } from '@/lib/admin/customer-edit'

type Params = { params: Promise<{ id: string }> }

const STEP_UP_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 5 }

// GET /api/admin/customers/[id] — the canonical customer card for the staff editor.
export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
  const caller = await requireAdminPermission('customers.read')
  if (caller instanceof NextResponse) return caller
  try {
    const { id } = await params
    const record = await loadCustomerRecord(prisma, id)
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    // Staff accounts are administered in the Super Admin flow, not here.
    if (record.staffAccount && !hasAdminPermission(caller, 'staff.manage')) {
      return NextResponse.json({ error: 'staff_account' }, { status: 403 })
    }
    return NextResponse.json({ customer: record, canEdit: hasAdminPermission(caller, 'customers.update') && !record.staffAccount })
  } catch (error) {
    logApiError('[admin/customers/:id GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// PATCH /api/admin/customers/[id] — staff edit of a customer's contact data, requisites,
// addresses and card. Admins and Super Admins only (customers.update); every change needs a
// reason, and an email change additionally needs the acting admin's password and TOTP.
export async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
  const blocked = guardOrigin(request)
  if (blocked) return blocked
  const caller = await requireAdminPermission('customers.update')
  if (caller instanceof NextResponse) return caller

  const parsed = customerEditSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  const { id } = await params

  try {
    let stepUpVerified = false
    if (input.changes.email !== undefined) {
      const target = await prisma.user.findUnique({ where: { id }, select: { email: true } })
      if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      // Same comparison as the service: any stored change of the address, re-casing included.
      if (target.email !== input.changes.email.trim().toLowerCase()) {
        if (!input.currentPassword || !input.mfaCode) return NextResponse.json({ error: 'reauthentication_required' }, { status: 401 })
        const limit = await checkRateLimit(`customer-email-step-up:${caller.id}`, STEP_UP_LIMIT)
        if (limit.limited) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
        const stepUp = await verifyAdminStepUp(caller.id, input.currentPassword, input.mfaCode)
        if (stepUp !== 'ok') return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })
        stepUpVerified = true
      }
    }

    const effects = await prisma.$transaction(
      (tx) => applyCustomerEdit(tx, request, caller, id, input, stepUpVerified),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    const customer = await loadCustomerRecord(prisma, id)
    return NextResponse.json({ customer, effects })
  } catch (error) {
    if (error instanceof CustomerEditError) {
      return NextResponse.json({ error: error.code, ...(error.details !== undefined ? { details: error.details } : {}) }, { status: error.status })
    }
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'P2002') return NextResponse.json({ error: 'unique_conflict' }, { status: 409 })
    if (code === 'P2034') return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
    logApiError('[admin/customers/:id PATCH]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
