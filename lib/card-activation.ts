import 'server-only'
import { prisma } from '@/lib/prisma'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { getTemplates } from '@/lib/email-templates-server-store'
import { buildInviteEmail, pickInviteTemplate } from '@/lib/invitation-emails'
import { hashInviteToken, newInviteToken, replaceInvitation, type InviteLang } from '@/lib/invitations'
import { sendEmail } from '@/lib/mailer'
import { logApiError } from '@/lib/observability'
import { checkRateLimit } from '@/lib/rate-limit'
import { getSiteUrl } from '@/lib/site-url'

/** A self-requested activation link is short-lived; staff-sent invitations keep INVITE_TTL_DAYS. */
export const CARD_ACTIVATION_TTL_HOURS = 24
/** Activation e-mails per card account per day — each new link replaces the previous one. */
export const CARD_ACTIVATION_SEND_LIMIT = { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 3 }

type ActivationCandidate = {
  id: string
  email: string
  name: string | null
  cardNumber: string | null
  platformRole: string
  teamRole: string | null
  superAdmin: boolean
  mustChangePassword: boolean
}

/** Synthetic import placeholders and GDPR-anonymised addresses are not a mailbox of the cardholder. */
export function hasDeliverableEmail(email: string): boolean {
  const value = email.trim().toLowerCase()
  return value.includes('@') && !value.endsWith('@client.local') && !value.endsWith('@deleted.invalid')
}

/**
 * Only a not-yet-activated customer card with a real e-mail on file may receive an activation
 * link. Staff accounts never do: the link sets a password on the account it belongs to.
 */
export function isCardActivationEligible(user: ActivationCandidate | null): user is ActivationCandidate & { cardNumber: string } {
  return Boolean(user
    && user.cardNumber
    && user.platformRole === 'customer'
    && !isProtectedStaffAccount(user)
    && user.mustChangePassword
    && hasDeliverableEmail(user.email))
}

export async function findCardActivationCandidate(cardNumber: string): Promise<ActivationCandidate | null> {
  return prisma.user.findFirst({
    where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    select: {
      id: true, email: true, name: true, cardNumber: true, platformRole: true,
      teamRole: true, superAdmin: true, mustChangePassword: true,
    },
  })
}

/**
 * Issues a one-time invitation (existing InvitationToken + /api/auth/invite flow) and mails it
 * to the address already on file. Never throws: it runs after the response has been sent.
 */
export async function sendCardActivationInvite(user: ActivationCandidate & { cardNumber: string }, language: InviteLang): Promise<void> {
  try {
    const limit = await checkRateLimit(`card-activation-send:${user.id}`, CARD_ACTIVATION_SEND_LIMIT)
    if (limit.limited) return

    const email = user.email.trim().toLowerCase()
    const token = newInviteToken()
    const expiresAt = new Date(Date.now() + CARD_ACTIVATION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    await prisma.$transaction(
      async (tx) => replaceInvitation(tx, { userId: user.id, email, cardNumber: user.cardNumber, token, expiresAt, language }),
      { isolationLevel: 'Serializable' },
    )

    const templates = await getTemplates()
    const tpl = pickInviteTemplate(templates, language)
    const { subject, html } = buildInviteEmail(
      language,
      { name: user.name ?? '', cardNumber: user.cardNumber, inviteUrl: `${getSiteUrl()}/auth/invite?token=${token}` },
      tpl ? { subject: tpl.subject, body: tpl.body } : undefined,
    )
    try {
      await sendEmail(email, subject, html)
    } catch (error) {
      // Same as the staff batch: an undelivered link is retired so it cannot be used later.
      await prisma.invitationToken.updateMany({
        where: { tokenHash: hashInviteToken(token), status: 'sent' },
        data: { status: 'error' },
      })
      throw error
    }
  } catch (error) {
    logApiError('[auth/register-card] activation invite failed', error)
  }
}
