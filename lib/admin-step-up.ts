import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode } from '@/lib/mfa'

/**
 * Re-checks the acting admin's own password and a fresh TOTP code. Used before
 * operations that could hand a customer account to someone else (email change).
 */
export async function verifyAdminStepUp(actorId: string, currentPassword: string | undefined, mfaCode: string | undefined): Promise<'ok' | 'required' | 'failed'> {
  if (!currentPassword || !mfaCode) return 'required'
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { passwordHash: true, mfaEnabled: true, mfaSecret: true },
  })
  const passwordValid = actor ? await verifyPassword(currentPassword, actor.passwordHash) : false
  let mfaValid = false
  if (actor?.mfaEnabled && actor.mfaSecret) {
    try {
      mfaValid = await verifyTotpCode(decryptSecret(actor.mfaSecret), mfaCode)
    } catch {
      mfaValid = false
    }
  }
  return passwordValid && mfaValid ? 'ok' : 'failed'
}
