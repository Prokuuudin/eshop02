import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission, verifyPassword } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { verifyTotpCode, decryptSecret } from '@/lib/mfa'
import { appendServerAudit } from '@/lib/server-audit'
import { hasAdminPermission, isStaffSubject, isSuperAdminSubject } from '@/lib/admin-permissions'
import { parseOffsetPagination } from '@/lib/pagination'
import { omitProfileOnlyFields, readCustomerDetails, syncCheckoutProfile } from '@/lib/admin-customer-details'
import { LEGAL_ADDRESS_MAX_LENGTH } from '@/lib/legal-details-limits'
import { carryMarketingSuppression, getMarketingSuppressions, suppressedUserIds } from '@/lib/marketing-suppression'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import {
  activeCardNumberFilter,
  assertUserCardMutationAllowed,
  getRevokedCardPolicy,
  isRevokedCardPolicyError,
} from '@/lib/revoked-card-policy'

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
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  platformRole: platformRoleSchema.optional(),
  superAdmin: z.boolean().optional(),
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
  legalAddress: z.string().trim().max(LEGAL_ADDRESS_MAX_LENGTH).nullable().optional(),
  // Stored only in the checkout profile (no User columns), see lib/admin-customer-details.ts.
  bankName: z.string().trim().max(200).nullable().optional(),
  iban: z.string().trim().max(50).nullable().optional(),
  deliveryAddress: z.string().trim().max(300).nullable().optional(),
  deliveryCity: z.string().trim().max(100).nullable().optional(),
  deliveryPostalCode: z.string().trim().max(20).nullable().optional(),
}).strict()

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const caller = await requireAdminPermission('customers.read')
    if (caller instanceof NextResponse) return caller

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const role = searchParams.get('role') || ''
    const teamRole = searchParams.get('teamRole') || ''
    const companyId = searchParams.get('companyId') || ''
    const customerType = searchParams.get('customerType') || ''
    const createdSince = searchParams.get('createdSince') || ''
    const hasCard = searchParams.get('hasCard') === '1'
    // «Без карты» (legacy accounts, merge candidates): platform admins only, never staff accounts.
    const noCard = searchParams.get('hasCard') === '0' && caller.platformRole === 'admin'
    const registration = searchParams.get('registration') || ''
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })
    // Only card-holder views depend on the registry; staff/admin lists keep working if it is unreadable.
    const cardHolderView = hasCard || registration === 'registered' || caller.platformRole !== 'admin'
    const cardFilter = cardHolderView ? activeCardNumberFilter(await getRevokedCardPolicy()) : { not: null }

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { cardNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (role) where.platformRole = role
    if (teamRoleSchema.safeParse(teamRole).success) where.teamRole = teamRole
    if (companyId) where.companyId = companyId
    if (customerTypeSchema.safeParse(customerType).success) where.customerType = customerType
    if (hasCard) where.cardNumber = cardFilter
    if (noCard) {
      where.cardNumber = null
      where.platformRole = 'customer'
      where.superAdmin = false
      where.AND = [{ OR: [{ teamRole: null }, { teamRole: { not: 'manager' } }] }]
    }
    if (registration === 'registered') {
      where.cardNumber = cardFilter
      where.platformRole = 'customer'
      where.privacyAcknowledgedAt = { not: null }
    }
    if (caller.platformRole !== 'admin') {
      where.cardNumber = cardFilter
      where.platformRole = 'customer'
    }
    if (createdSince) {
      const date = new Date(createdSince)
      if (!Number.isNaN(date.getTime())) where.createdAt = { gte: date }
    }
    // «Рассылки запрещены» filter: matched on the normalized email, see lib/marketing-suppression.
    const mailing = searchParams.get('mailing')
    if (mailing === 'suppressed') where.id = { in: await suppressedUserIds() }
    if (mailing === 'allowed') where.id = { notIn: await suppressedUserIds() }

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
          superAdmin: true,
          phone: true,
          cardNumber: true,
          avatarUrl: true,
          bonusPoints: true,
          customerType: true,
          registrationNumber: true,
          vatNumber: true,
          legalAddress: true,
          checkoutProfile: true,
          privacyAcknowledgedAt: true,
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

    const suppressions = await getMarketingSuppressions(users.map((u) => u.email))
    const mapped = users.map(({ checkoutProfile, ...u }) => {
      const suppression = suppressions.get(u.email.trim().toLowerCase())
      return {
        ...u,
        ...readCustomerDetails(u, checkoutProfile),
        marketingSuppression: suppression
          ? { since: suppression.optedOutAt, source: suppression.source, setByName: suppression.setByName, reason: suppression.reason }
          : null,
        registered: u.privacyAcknowledgedAt !== null && u.platformRole === 'customer',
        registeredAt: u.privacyAcknowledgedAt instanceof Date ? u.privacyAcknowledgedAt.toISOString() : null,
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
        updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : String(u.updatedAt),
      }
    })

    return NextResponse.json({ users: mapped, total })
  } catch (e) {
    if (isRevokedCardPolicyError(e)) {
      return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
    }
    logApiError("[admin/users GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

type StaffTarget = { platformRole: string; teamRole: string | null; superAdmin: boolean }
type PatchUpdates = Omit<z.infer<typeof patchSchema>, 'id' | 'expectedUpdatedAt' | 'currentPassword' | 'mfaCode' | 'reason'>

const changesStaffAccess = (target: StaffTarget, updates: PatchUpdates): boolean =>
  updates.platformRole !== undefined || updates.superAdmin !== undefined
  || (updates.teamRole !== undefined && (updates.teamRole === 'manager' || target.teamRole === 'manager'))

/**
 * Super Admin (staff.manage) is required to change anyone's staff access (platform role,
 * the staff 'manager' team role, the Super Admin flag) and to edit another staff account
 * at all — an email change there is the first step of an account takeover via password reset.
 */
const requiresStaffManage = (target: StaffTarget, updates: PatchUpdates, isSelf: boolean): boolean =>
  changesStaffAccess(target, updates) || (!isSelf && isStaffSubject(target))

/**
 * Who already holds the email a save collided with, so the admin can find that account. Often
 * it is a legacy (pre-card) account that the card-holder list never shows. A staff holder is
 * reported only as staff. Best effort: without an answer the plain email_taken still stands.
 */
async function describeEmailHolder(email: string, targetId: string) {
  try {
    const holder = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, cardNumber: true, createdAt: true, platformRole: true, teamRole: true, superAdmin: true },
    })
    if (!holder || holder.id === targetId) return null
    if (isStaffSubject(holder)) return { staff: true as const }
    // The id lets an admin open the merge preview; merging itself is checked again on the server.
    return { staff: false as const, id: holder.id, name: holder.name, cardNumber: holder.cardNumber, createdAt: holder.createdAt.toISOString() }
  } catch {
    return null
  }
}

type UniqueSave = { targetId: string; email?: string; cardNumber?: string }

/**
 * User has two unique columns, email and cardNumber, and P2002 does not reliably say which one
 * collided. Ask the database who holds each value instead of reporting every clash as email.
 */
async function uniqueViolationResponse(save: UniqueSave | null): Promise<Response> {
  if (save?.email) {
    const emailHolder = await describeEmailHolder(save.email, save.targetId)
    if (emailHolder) return NextResponse.json({ error: 'email_taken', emailHolder }, { status: 409 })
  }
  if (save?.cardNumber) {
    const cardHolder = await prisma.user.findUnique({ where: { cardNumber: save.cardNumber }, select: { id: true } }).catch(() => null)
    if (cardHolder && cardHolder.id !== save.targetId) return NextResponse.json({ error: 'card_taken' }, { status: 409 })
    if (!save.email) return NextResponse.json({ error: 'card_taken' }, { status: 409 })
  }
  return NextResponse.json({ error: 'email_taken' }, { status: 409 })
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  // Kept outside the try so a unique violation can say which value, and whose account, it hit.
  let uniqueSave: UniqueSave | null = null
  try {
    const caller = await requireAdminPermission('admin.access')
    if (caller instanceof NextResponse) return caller

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 })
    }

    const { id, expectedUpdatedAt, currentPassword, mfaCode, reason, ...parsedUpdates } = parsed.data
    let updates = parsedUpdates
    if (updates.cardNumber !== undefined && updates.cardNumber !== null) {
      const normalized = normalizeCardNumber(updates.cardNumber)
      if (!isValidCardNumber(normalized)) {
        return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
      }
      updates = { ...updates, cardNumber: normalized }
    }
    uniqueSave = { targetId: id, email: updates.email, cardNumber: updates.cardNumber ?? undefined }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'no_updates' }, { status: 400 })
    // Fields a staff manager may edit. Bank name and IBAN are deliberately absent: they are
    // payment details printed on invoices, so only a platform admin (incl. Super Admin) may change them.
    const customerDetailFields = new Set([
      'name', 'email', 'phone', 'customerType', 'registrationNumber', 'vatNumber', 'legalAddress',
      'deliveryAddress', 'deliveryCity', 'deliveryPostalCode',
    ])
    const customerDetailsOnly = Object.keys(updates).every((field) => customerDetailFields.has(field))
    if (caller.platformRole !== 'admin' && !customerDetailsOnly) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const isSelf = id === caller.id
    if (isSelf && (updates.platformRole !== undefined || updates.superAdmin !== undefined)) {
      return NextResponse.json({ error: 'self_role_change_forbidden' }, { status: 409 })
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { platformRole: true, teamRole: true, superAdmin: true, cardNumber: true } })
    if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (isSelf && changesStaffAccess(target, updates)) {
      return NextResponse.json({ error: 'self_role_change_forbidden' }, { status: 409 })
    }
    const staffChange = requiresStaffManage(target, updates, isSelf)
    if (staffChange && !hasAdminPermission(caller, 'staff.manage')) {
      return NextResponse.json({ error: 'super_admin_required' }, { status: 403 })
    }
    if (updates.superAdmin === true && (target.platformRole !== 'admin' || updates.platformRole !== undefined)) {
      return NextResponse.json({ error: 'super_admin_requires_admin' }, { status: 409 })
    }

    // Staff changes are step-up authenticated: MFA is mandatory for the acting Super Admin.
    // A promoted target needs no prior MFA — every session is revoked on promotion and the
    // next login forces TOTP enrollment before any admin session exists.
    if (staffChange) {
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
      const promotionTarget = await prisma.user.findUnique({ where: { id }, select: { email: true, platformRole: true, updatedAt: true } })
      if (!promotionTarget) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      if (promotionTarget.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        return NextResponse.json({ error: 'optimistic_conflict' }, { status: 409 })
      }
      if (promotionTarget.platformRole !== 'admin') {
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
            entityTitle: promotionTarget.email, before: { platformRole: promotionTarget.platformRole },
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
      if (caller.platformRole !== 'admin' && (before.platformRole !== 'customer' || !before.cardNumber)) {
        throw new Error('forbidden')
      }
      if (before.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new Error('optimistic_conflict')
      }
      if (updates.cardNumber !== undefined) {
        await assertUserCardMutationAllowed(id, before.cardNumber, updates.cardNumber, tx)
      }
      // The target may have become staff since the pre-check: re-decide on the locked row.
      if (requiresStaffManage(before, updates, isSelf) && !staffChange) throw new Error('reauthentication_required')
      if (isSelf && changesStaffAccess(before, updates)) throw new Error('self_role_change_forbidden')
      if (updates.superAdmin === true && before.platformRole !== 'admin') throw new Error('super_admin_requires_admin')
      if (before.platformRole === 'admin' && updates.platformRole && updates.platformRole !== 'admin') {
        const adminCount = await tx.user.count({ where: { platformRole: 'admin' } })
        if (adminCount <= 1) throw new Error('last_admin_protected')
      }

      // Leaving the admin role always drops the Super Admin flag with it.
      const columnUpdates = omitProfileOnlyFields(updates)
      const roleData = updates.platformRole !== undefined && updates.platformRole !== 'admin'
        ? { ...columnUpdates, superAdmin: false }
        : columnUpdates
      // The admin lists and the customer's checkout read the checkout profile first: keep it in
      // step with the edited columns, or the change is hidden again on the next reload.
      const checkoutProfile = syncCheckoutProfile(before, updates)
      const data = checkoutProfile
        ? { ...roleData, checkoutProfile: checkoutProfile as Prisma.InputJsonObject }
        : roleData
      const updateResult = await tx.user.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data,
      })
      if (updateResult.count !== 1) throw new Error('optimistic_conflict')
      const after = await tx.user.findUniqueOrThrow({ where: { id } })
      if (isSuperAdminSubject(before) && !isSuperAdminSubject(after)) {
        const superAdmins = await tx.user.count({ where: { platformRole: 'admin', superAdmin: true } })
        if (superAdmins < 1) throw new Error('last_super_admin_protected')
      }

      const privilegesChanged = before.platformRole !== after.platformRole
        || before.teamRole !== after.teamRole
        || before.superAdmin !== after.superAdmin
        || before.companyId !== after.companyId
        || before.approvalRequired !== after.approvalRequired
        || before.mustChangePassword !== after.mustChangePassword
      if (privilegesChanged) await tx.session.deleteMany({ where: { userId: id } })

      const emailChanged = before.email !== after.email
      // Activation and reset links already mailed to the old address must not outlive the change
      // (the old address may be a typo someone else receives); accepted invitations stay as history.
      if (emailChanged) {
        await tx.invitationToken.deleteMany({ where: { userId: id, status: { not: 'accepted' } } })
        await tx.passwordResetToken.deleteMany({ where: { userId: id } })
        // «Рассылки запрещены» belongs to the person: the new address inherits the block.
        await carryMarketingSuppression(tx, before.email, after.email)
      }
      await appendServerAudit(tx, req, caller, {
          action: privilegesChanged ? 'user.privileges_changed' : 'user.updated', entityType: 'user', entityId: id, entityTitle: before.email,
          before: {
            platformRole: before.platformRole, teamRole: before.teamRole, superAdmin: before.superAdmin, companyId: before.companyId,
            approvalRequired: before.approvalRequired, auditLoggingEnabled: before.auditLoggingEnabled,
            mustChangePassword: before.mustChangePassword, ...(emailChanged ? { email: before.email } : {}),
          },
          after: {
            platformRole: after.platformRole, teamRole: after.teamRole, superAdmin: after.superAdmin, companyId: after.companyId,
            approvalRequired: after.approvalRequired, auditLoggingEnabled: after.auditLoggingEnabled,
            mustChangePassword: after.mustChangePassword, ...(emailChanged ? { email: after.email } : {}),
          },
          details: `expectedUpdatedAt=${expectedUpdatedAt}; sessionsRevoked=${privilegesChanged}`,
          reason: privilegesChanged || staffChange ? reason ?? null : null,
      })
      return after
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ user: {
      id: user.id, email: user.email, name: user.name, platformRole: user.platformRole,
      companyId: user.companyId, teamRole: user.teamRole, superAdmin: user.superAdmin, mfaEnabled: user.mfaEnabled,
      customerType: user.customerType, registrationNumber: user.registrationNumber,
      vatNumber: user.vatNumber, legalAddress: user.legalAddress,
      updatedAt: user.updatedAt.toISOString(),
    } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (['optimistic_conflict', 'last_admin_protected', 'last_super_admin_protected', 'super_admin_requires_admin', 'self_role_change_forbidden'].includes(message)) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (message === 'reauthentication_required') return NextResponse.json({ error: message }, { status: 401 })
    if (message === 'forbidden') return NextResponse.json({ error: message }, { status: 403 })
    if (isRevokedCardPolicyError(e, 'card_revoked')) {
      return NextResponse.json({ error: 'card_revoked' }, { status: 409 })
    }
    if (isRevokedCardPolicyError(e)) {
      return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
    }
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return await uniqueViolationResponse(uniqueSave)
    }
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2034') {
      return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
    }
    logApiError("[admin/users PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
