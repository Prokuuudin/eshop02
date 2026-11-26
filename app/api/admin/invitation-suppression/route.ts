import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { getPermissionAccessLevel } from '@/lib/admin-permissions'
import {
  addInvitationSuppression,
  getInvitationSuppressions,
  INVITATION_SUPPRESSION_REASON_MAX_LENGTH,
  removeInvitationSuppression,
} from '@/lib/invitation-suppression'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { requireAdmin, requireAdminPermission } from '@/lib/server-auth'

export const runtime = 'nodejs'

const requestSchema = z.object({
  userId: z.string().min(1).max(200),
  reason: z.string().trim().min(3).max(INVITATION_SUPPRESSION_REASON_MAX_LENGTH),
}).strict()

class RouteError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
  }
}

type TargetRow = { platformRole: string }

/** Customer editors may record a client's request; non-admin staff may only change customers. */
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdminPermission('customers.read')
  if (caller instanceof NextResponse) return caller
  if (getPermissionAccessLevel(caller) === 'none') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'reason_required' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<TargetRow[]>`
        SELECT "platformRole" FROM "User" WHERE id = ${parsed.data.userId} FOR UPDATE`
      if (!target) throw new RouteError('not_found', 404)
      if (caller.platformRole !== 'admin' && target.platformRole !== 'customer') throw new RouteError('forbidden', 403)
      const { created } = await addInvitationSuppression(tx, {
        userId: parsed.data.userId,
        source: 'admin',
        setByUserId: caller.id,
        setByName: caller.name || caller.email,
        reason: parsed.data.reason,
      })
      if (!created) throw new RouteError('already_suppressed', 409)
      await appendServerAudit(tx, req, caller, {
        action: 'invitation.suppression_set',
        entityType: 'user',
        entityId: parsed.data.userId,
        before: { invitationSuppressed: false },
        after: { invitationSuppressed: true, source: 'admin' },
        reason: parsed.data.reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RouteError) return NextResponse.json({ error: error.code }, { status: error.status })
    logApiError('[admin/invitation-suppression POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Lifting resumes invitations, so it remains platform-admin-only and requires a reason. */
export async function DELETE(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  if (getPermissionAccessLevel(caller) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'reason_required' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<TargetRow[]>`
        SELECT "platformRole" FROM "User" WHERE id = ${parsed.data.userId} FOR UPDATE`
      if (!target) throw new RouteError('not_found', 404)
      const current = (await getInvitationSuppressions([parsed.data.userId], tx)).get(parsed.data.userId)
      if (!current) throw new RouteError('not_suppressed', 409)
      const removed = await removeInvitationSuppression(tx, parsed.data.userId)
      if (!removed) throw new RouteError('not_suppressed', 409)
      await appendServerAudit(tx, req, caller, {
        action: 'invitation.suppression_lifted',
        entityType: 'user',
        entityId: parsed.data.userId,
        before: { invitationSuppressed: true, source: removed.source, since: removed.optedOutAt },
        after: { invitationSuppressed: false },
        reason: parsed.data.reason,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RouteError) return NextResponse.json({ error: error.code }, { status: error.status })
    logApiError('[admin/invitation-suppression DELETE]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
