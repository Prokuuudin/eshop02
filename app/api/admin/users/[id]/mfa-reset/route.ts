import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { guardOrigin } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission, verifyPassword } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'
import { appendServerAudit } from '@/lib/server-audit'

const resetSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  mfaCode: z.string().regex(/^\d{6}$/u),
  reason: z.string().trim().min(5).max(1000),
}).strict()

// POST /api/admin/users/[id]/mfa-reset — for a colleague who lost their phone and recovery
// codes. Step-up authenticated (actor's password + own TOTP), audited, and never for the
// actor themselves. It does not grant access: the target's sessions are revoked and their
// next login forces a fresh TOTP enrollment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const blocked = guardOrigin(request)
  if (blocked) return blocked
  const caller = await requireAdminPermission('users.manage')
  if (caller instanceof NextResponse) return caller

  const parsed = resetSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { id } = await params
  if (id === caller.id) return NextResponse.json({ error: 'self_reset_forbidden' }, { status: 409 })

  const limit = await checkRateLimit(`mfa-reset:${caller.id}`, { windowMs: 15 * 60 * 1000, maxAttempts: 5 })
  if (limit.limited) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })

  try {
    const actor = await prisma.user.findUnique({
      where: { id: caller.id },
      select: { passwordHash: true, mfaEnabled: true, mfaSecret: true },
    })
    const passwordValid = actor ? await verifyPassword(parsed.data.currentPassword, actor.passwordHash) : false
    let mfaValid = false
    if (actor?.mfaEnabled && actor.mfaSecret) {
      try {
        mfaValid = await verifyTotpCode(decryptSecret(actor.mfaSecret), parsed.data.mfaCode)
      } catch {
        mfaValid = false
      }
    }
    if (!passwordValid || !mfaValid) {
      return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })
    }

    const target = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { email: true, mfaEnabled: true, mfaEnrolledAt: true },
      })
      if (!before) return null
      await tx.user.update({
        where: { id },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
      })
      await tx.session.deleteMany({ where: { userId: id } })
      await tx.mfaChallenge.deleteMany({ where: { userId: id } })
      await appendServerAudit(tx, request, caller, {
        action: 'user.mfa_reset',
        entityType: 'user',
        entityId: id,
        entityTitle: before.email,
        before: { mfaEnabled: before.mfaEnabled, mfaEnrolledAt: before.mfaEnrolledAt?.toISOString() ?? null },
        after: { mfaEnabled: false, sessionsRevoked: true },
        reason: parsed.data.reason,
      })
      return before
    })
    if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logApiError('[admin/users/mfa-reset POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
