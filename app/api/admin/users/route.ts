import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission, verifyPassword } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { verifyTotpCode, decryptSecret } from '@/lib/mfa'
import { appendServerAudit } from '@/lib/server-audit'
import { parseOffsetPagination } from '@/lib/pagination'

const platformRoleSchema = z.enum(['customer', 'admin'])
const teamRoleSchema = z.enum(['viewer', 'buyer', 'manager', 'admin'])
const customerTypeSchema = z.enum(['individual', 'company'])
const patchSchema = z.object({
  id: z.string().min(1).max(200),
  expectedUpdatedAt: z.iso.datetime(),
  currentPassword: z.string().min(1).max(1024).optional(),
  mfaCode: z.string().regex(/^\d{6}$/u).optional(),
  reason: z.string().trim().min(5).max(1000).optional(),
  name: z.string().trim().min(1).max(200).nullable().optional(),
  platformRole: platformRoleSchema.optional(),
  companyId: z.string().trim().max(200).nullable().optional(),
  companyName: z.string().trim().max(300).nullable().optional(),
  teamRole: teamRoleSchema.nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  cardNumber: z.string().trim().max(100).nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  approvalRequired: z.boolean().optional(),
  auditLoggingEnabled: z.boolean().optional(),
  customerType: customerTypeSchema.optional(),
  registrationNumber: z.string().trim().max(50).nullable().optional(),
  vatNumber: z.string().trim().max(50).nullable().optional(),
  legalAddress: z.string().trim().max(500).nullable().optional(),
}).strict()

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const caller = await requireAdminPermission('users.manage')
    if (caller instanceof NextResponse) return caller

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const role = searchParams.get('role') || ''
    const companyId = searchParams.get('companyId') || ''
    const customerType = searchParams.get('customerType') || ''
    const createdSince = searchParams.get('createdSince') || ''
    const hasCard = searchParams.get('hasCard') === '1'
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { cardNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (role) where.platformRole = role
    if (companyId) where.companyId = companyId
    if (customerTypeSchema.safeParse(customerType).success) where.customerType = customerType
    if (hasCard) where.cardNumber = { not: null }
    if (createdSince) {
      const date = new Date(createdSince)
      if (!Number.isNaN(date.getTime())) where.createdAt = { gte: date }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          companyId: true,
          companyName: true,
          teamRole: true,
          phone: true,
          cardNumber: true,
          avatarUrl: true,
          bonusPoints: true,
          customerType: true,
          registrationNumber: true,
          vatNumber: true,
          legalAddress: true,
          approvalRequired: true,
          auditLoggingEnabled: true,
          mustChangePassword: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,
          // Never expose passwordHash
        },
      }),
      prisma.user.count({ where }),
    ])

    const mapped = users.map((u) => ({
      ...u,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : String(u.updatedAt),
    }))

    return NextResponse.json({ users: mapped, total })
  } catch (e) {
    logApiError("[admin/users GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  try {
    const caller = await requireAdminPermission('users.manage')
    if (caller instanceof NextResponse) return caller

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 })
    }

    const { id, expectedUpdatedAt, currentPassword, mfaCode, reason, ...updates } = parsed.data
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'no_updates' }, { status: 400 })

    const roleChangeRequested = updates.platformRole !== undefined
    if (id === caller.id && roleChangeRequested) {
      return NextResponse.json({ error: 'self_role_change_forbidden' }, { status: 409 })
    }

    // Role changes are step-up authenticated. MFA is mandatory for the acting admin,
    // and a user cannot be promoted until their own TOTP enrollment is complete.
    if (roleChangeRequested) {
      if (!reason) return NextResponse.json({ error: 'change_reason_required' }, { status: 400 })
      if (!currentPassword || !mfaCode) {
        return NextResponse.json({ error: 'reauthentication_required' }, { status: 401 })
      }
      const actorCredentials = await prisma.user.findUnique({
        where: { id: caller.id },
        select: { passwordHash: true, mfaEnabled: true, mfaSecret: true },
      })
      const passwordValid = actorCredentials
        ? await verifyPassword(currentPassword, actorCredentials.passwordHash)
        : false
      const mfaValid = actorCredentials?.mfaEnabled && actorCredentials.mfaSecret
        ? await verifyTotpCode(decryptSecret(actorCredentials.mfaSecret), mfaCode)
        : false
      if (!passwordValid || !mfaValid) {
        return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })
      }
    }

    if (updates.platformRole === 'admin') {
      const target = await prisma.user.findUnique({ where: { id }, select: { email: true, platformRole: true, mfaEnabled: true, updatedAt: true } })
      if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      if (target.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        return NextResponse.json({ error: 'optimistic_conflict' }, { status: 409 })
      }
      if (target.platformRole !== 'admin') {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const approval = await prisma.$transaction(async (tx) => {
          await tx.adminRoleChangeRequest.updateMany({
            where: { targetUserId: id, status: 'pending' },
            data: { status: 'superseded', resolvedAt: new Date() },
          })
          const request = await tx.adminRoleChangeRequest.create({
            data: { targetUserId: id, requestedByUserId: caller.id, requestedRole: 'admin', expectedUpdatedAt: new Date(expectedUpdatedAt), expiresAt },
          })
          await appendServerAudit(tx, req, caller, {
            action: 'user.admin_promotion_requested', entityType: 'user', entityId: id,
            entityTitle: target.email, before: { platformRole: target.platformRole },
            after: { requestedPlatformRole: 'admin', approvalRequestId: request.id },
            reason,
          })
          return request
        })
        return NextResponse.json({ pendingApproval: true, requestId: approval.id, expiresAt: approval.expiresAt.toISOString() }, { status: 202 })
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } })
      if (!before) return null
      if (before.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new Error('optimistic_conflict')
      }
      if (before.platformRole === 'admin' && updates.platformRole && updates.platformRole !== 'admin') {
        const adminCount = await tx.user.count({ where: { platformRole: 'admin' } })
        if (adminCount <= 1) throw new Error('last_admin_protected')
      }

      const updateResult = await tx.user.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data: updates,
      })
      if (updateResult.count !== 1) throw new Error('optimistic_conflict')
      const after = await tx.user.findUniqueOrThrow({ where: { id } })

      const privilegesChanged = before.platformRole !== after.platformRole
        || before.teamRole !== after.teamRole
        || before.companyId !== after.companyId
        || before.approvalRequired !== after.approvalRequired
        || before.mustChangePassword !== after.mustChangePassword
      if (privilegesChanged) await tx.session.deleteMany({ where: { userId: id } })

      await appendServerAudit(tx, req, caller, {
          action: privilegesChanged ? 'user.privileges_changed' : 'user.updated', entityType: 'user', entityId: id, entityTitle: before.email,
          before: {
            platformRole: before.platformRole, teamRole: before.teamRole, companyId: before.companyId,
            approvalRequired: before.approvalRequired, auditLoggingEnabled: before.auditLoggingEnabled,
            mustChangePassword: before.mustChangePassword,
          },
          after: {
            platformRole: after.platformRole, teamRole: after.teamRole, companyId: after.companyId,
            approvalRequired: after.approvalRequired, auditLoggingEnabled: after.auditLoggingEnabled,
            mustChangePassword: after.mustChangePassword,
          },
          details: `expectedUpdatedAt=${expectedUpdatedAt}; sessionsRevoked=${privilegesChanged}`,
          reason: privilegesChanged ? reason ?? null : null,
      })
      return after
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ user: {
      id: user.id, email: user.email, name: user.name, platformRole: user.platformRole,
      companyId: user.companyId, teamRole: user.teamRole, mfaEnabled: user.mfaEnabled,
      customerType: user.customerType, registrationNumber: user.registrationNumber,
      vatNumber: user.vatNumber, legalAddress: user.legalAddress,
      updatedAt: user.updatedAt.toISOString(),
    } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'optimistic_conflict') return NextResponse.json({ error: message }, { status: 409 })
    if (message === 'last_admin_protected') return NextResponse.json({ error: message }, { status: 409 })
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2034') {
      return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
    }
    logApiError("[admin/users PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
