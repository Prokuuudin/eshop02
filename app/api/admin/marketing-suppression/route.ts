import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin, requireAdminPermission } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { appendServerAudit } from '@/lib/server-audit'
import { getPermissionAccessLevel } from '@/lib/admin-permissions'
import {
  addMarketingSuppression,
  CONSENT_NOTE_MAX_LENGTH,
  getMarketingSuppressions,
  normalizeMarketingEmail,
  removeMarketingSuppression,
  SUPPRESSION_REASON_MAX_LENGTH,
} from '@/lib/marketing-suppression'

export const runtime = 'nodejs'

// «Запретить рассылки и приглашения» on a client card. The block is stored per normalized
// email in the central suppression list; this route only sets and lifts it, with an audit
// event in the same transaction. It changes nothing about sign-in, cards, bonuses or orders.

const setSchema = z.object({
  userId: z.string().min(1).max(200),
  reason: z.string().trim().max(SUPPRESSION_REASON_MAX_LENGTH).optional(),
}).strict()

// Lifting the block resumes marketing, so the admin must confirm that the client gave new
// consent and say how (the note goes to the audit log as the documented reason).
const liftSchema = z.object({
  userId: z.string().min(1).max(200),
  consentConfirmed: z.literal(true),
  consentNote: z.string().trim().min(3).max(CONSENT_NOTE_MAX_LENGTH),
}).strict()

class RouteError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
  }
}

type TargetRow = { email: string; platformRole: string }

/** Sets the block. Platform admins and managers (customer-detail editors) may do it; managers only on customers. */
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdminPermission('customers.read')
  if (caller instanceof NextResponse) return caller
  // Explicit staff check on top of the permission: only a platform admin (incl. Super Admin)
  // or a staff manager may change mailing status. A company-owner teamRole ('admin') or any
  // future role that is granted customers.read for viewing does not qualify.
  if (getPermissionAccessLevel(caller) === 'none') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = setSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { userId } = parsed.data
  const reason = parsed.data.reason || null

  try {
    await prisma.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<TargetRow[]>`
        SELECT email, "platformRole" FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!target) throw new RouteError('not_found', 404)
      if (caller.platformRole !== 'admin' && target.platformRole !== 'customer') throw new RouteError('forbidden', 403)
      const { created } = await addMarketingSuppression(tx, {
        email: target.email,
        source: 'admin',
        setByUserId: caller.id,
        setByName: caller.name || caller.email,
        reason,
      })
      if (!created) throw new RouteError('already_suppressed', 409)
      // IDs and flags only: the email stays out of the audit row.
      await appendServerAudit(tx, req, caller, {
        action: 'marketing.suppression_set', entityType: 'user', entityId: userId,
        before: { marketingSuppressed: false },
        after: { marketingSuppressed: true, source: 'admin' },
        reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RouteError) return NextResponse.json({ error: e.code }, { status: e.status })
    logApiError('[admin/marketing-suppression POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Lifts the block. Platform admins only, with a confirmed and described new consent. */
export async function DELETE(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  if (getPermissionAccessLevel(caller) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = liftSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === 'consentConfirmed' || issue.path[0] === 'consentNote')
    return NextResponse.json({ error: consentMissing ? 'consent_confirmation_required' : 'invalid_request' }, { status: 400 })
  }
  const { userId, consentNote } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<TargetRow[]>`
        SELECT email, "platformRole" FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!target) throw new RouteError('not_found', 404)
      // A GDPR-erasure entry is a legal record of the erased person's address, not a
      // marketing preference of this account: the client-card switch never removes it.
      const current = (await getMarketingSuppressions([target.email], tx)).get(normalizeMarketingEmail(target.email))
      if (!current) throw new RouteError('not_suppressed', 409)
      if (current.source === 'erasure') throw new RouteError('erasure_protected', 409)
      const removed = await removeMarketingSuppression(tx, target.email)
      if (!removed) throw new RouteError('not_suppressed', 409)
      await appendServerAudit(tx, req, caller, {
        action: 'marketing.suppression_lifted', entityType: 'user', entityId: userId,
        before: { marketingSuppressed: true, source: removed.source, since: removed.optedOutAt },
        after: { marketingSuppressed: false, newConsentConfirmed: true },
        reason: consentNote,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RouteError) return NextResponse.json({ error: e.code }, { status: e.status })
    logApiError('[admin/marketing-suppression DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
