import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'
import { guardOrigin } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission, verifyPassword } from '@/lib/server-auth'
import { verifyTotpCode, decryptSecret } from '@/lib/mfa'
import { appendServerAudit } from '@/lib/server-audit'

const approvalSchema = z.object({
  requestId: z.string().min(1).max(200),
  currentPassword: z.string().min(1).max(1024),
  mfaCode: z.string().regex(/^\d{6}$/u),
  reason: z.string().trim().min(5).max(1000),
}).strict()

export async function GET(): Promise<Response> {
  const caller = await requireAdminPermission('users.manage')
  if (caller instanceof NextResponse) return caller
  const requests = await prisma.adminRoleChangeRequest.findMany({
    where: { status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' }, take: 100,
  })
  return NextResponse.json({ requests })
}

export async function POST(request: NextRequest): Promise<Response> {
  const blocked = guardOrigin(request)
  if (blocked) return blocked
  const caller = await requireAdminPermission('users.manage')
  if (caller instanceof NextResponse) return caller
  const parsed = approvalSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const actor = await prisma.user.findUnique({ where: { id: caller.id }, select: { passwordHash: true, mfaEnabled: true, mfaSecret: true } })
  const passwordValid = actor ? await verifyPassword(parsed.data.currentPassword, actor.passwordHash) : false
  const mfaValid = actor?.mfaEnabled && actor.mfaSecret
    ? await verifyTotpCode(decryptSecret(actor.mfaSecret), parsed.data.mfaCode)
    : false
  if (!passwordValid || !mfaValid) return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pending = await tx.adminRoleChangeRequest.findUnique({ where: { id: parsed.data.requestId } })
      if (!pending || pending.status !== 'pending' || pending.expiresAt <= new Date()) throw new Error('approval_not_pending')
      if (pending.requestedByUserId === caller.id) throw new Error('four_eyes_required')
      const target = await tx.user.findUnique({ where: { id: pending.targetUserId } })
      if (!target) throw new Error('target_not_found')
      if (target.updatedAt.getTime() !== pending.expectedUpdatedAt.getTime()) throw new Error('optimistic_conflict')

      const changed = await tx.user.updateMany({
        where: { id: target.id, updatedAt: pending.expectedUpdatedAt }, data: { platformRole: 'admin' },
      })
      if (changed.count !== 1) throw new Error('optimistic_conflict')
      await tx.session.deleteMany({ where: { userId: target.id } })
      await tx.adminRoleChangeRequest.update({
        where: { id: pending.id }, data: { status: 'approved', approvedByUserId: caller.id, resolvedAt: new Date() },
      })
      await appendServerAudit(tx, request, caller, {
          action: 'user.admin_promotion_approved', entityType: 'user', entityId: target.id,
          entityTitle: target.email, before: { platformRole: target.platformRole },
          after: { platformRole: 'admin', requestId: pending.id },
          details: `requestedBy=${pending.requestedByUserId}; approvedBy=${caller.id}; sessionsRevoked=true`,
          reason: parsed.data.reason,
      })
      return target.id
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ approved: true, userId: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'server_error'
    if (['approval_not_pending', 'four_eyes_required', 'target_not_found', 'optimistic_conflict'].includes(message)) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') {
      return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
    }
    console.error('[admin/users/role-approvals POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
