import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { unsubscribeFromMarketing } from '@/lib/newsletter-store'

/**
 * GDPR erasure by anonymisation (Art. 17). Personal data cannot be hard-deleted
 * because orders/invoices must be retained for tax/accounting; instead every PII
 * field tied to the account is scrubbed or its record removed, and login is
 * permanently locked. Financial rows survive with their personal fields blanked.
 */

const anonEmail = (userId: string): string => `anon-${userId}@deleted.invalid`

export type UserExport = {
  exportedAt: string
  profile: Record<string, unknown>
  orders: unknown[]
  invoices: unknown[]
  reviews: unknown[]
  savedAddresses: unknown[]
  subscriptions: unknown[]
  stockNotifications: unknown[]
  returnRequests: unknown[]
  wishlist: unknown[]
  notifications: unknown[]
  accessRequests: unknown[]
  invitations: unknown[]
}

/** Assembles everything the platform holds about a data subject (Art. 15/20). */
export async function exportUserData(params: {
  id: string
  email: string
}): Promise<UserExport> {
  const { id, email } = params
  const emailLower = email.toLowerCase()

  // Orders first — invoices are scoped through them so a company member's personal
  // export never dumps company-wide invoices (Invoice has no per-user key of its own).
  const orders = await prisma.order.findMany({
    where: { OR: [{ userId: id }, { email: emailLower }] },
    orderBy: { createdAt: 'desc' },
  })
  const orderIds = orders.map((o) => o.id)

  const [profile, savedAddresses, subscriptions, stockNotifications, returnRequests, invoices,
    wishlist, notifications, accessRequests, invitations] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, name: true, phone: true, cardNumber: true, avatarUrl: true,
          platformRole: true, companyId: true, companyName: true, teamRole: true,
          bonusPoints: true, createdAt: true, marketingConsent: true,
          marketingConsentAt: true, privacyNoticeVersion: true, privacyAcknowledgedAt: true,
        },
      }),
      prisma.savedAddress.findMany({ where: { email: emailLower } }),
      prisma.productSubscription.findMany({ where: { OR: [{ userId: id }, { userEmail: emailLower }] } }),
      prisma.stockNotification.findMany({ where: { OR: [{ userId: id }, { email: emailLower }] } }),
      prisma.returnRequest.findMany({ where: { email: emailLower } }),
      orderIds.length ? prisma.invoice.findMany({ where: { orderId: { in: orderIds } } }) : Promise.resolve([]),
      prisma.wishlistItem.findMany({ where: { userId: id }, orderBy: { addedAt: 'desc' } }),
      prisma.userNotification.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.accessRequest.findMany({
        where: { email: emailLower },
        select: {
          id: true, email: true, name: true, phone: true, companyId: true, companyName: true,
          cardNumber: true, status: true, requestedAt: true, reviewedAt: true,
          approvedTeamRole: true, reviewNote: true, requestType: true, message: true, language: true,
          privacyNoticeVersion: true, privacyAcknowledgedAt: true,
          marketingConsent: true, marketingConsentAt: true,
        },
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.invitationToken.findMany({
        where: { userId: id },
        select: { id: true, email: true, cardNumber: true, language: true, status: true, expiresAt: true, acceptedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

  return {
    exportedAt: new Date().toISOString(),
    profile: (profile ?? {}) as Record<string, unknown>,
    orders,
    invoices,
    // Reviews are intentionally omitted: the schema has no userId FK on Review, and
    // matching by the mutable `author` display name would return third parties' reviews
    // (over-disclosure). Review erasure is handled manually until a userId FK is added.
    reviews: [],
    savedAddresses,
    subscriptions,
    stockNotifications,
    returnRequests,
    wishlist,
    notifications,
    accessRequests,
    invitations,
  }
}

/** Irreversibly anonymises the account and everything linked to it. */
export async function anonymizeUser(params: {
  id: string
  email: string
}): Promise<void> {
  const { id, email } = params
  const emailLower = email.toLowerCase()
  const scrubbedEmail = anonEmail(id)
  // A valid bcrypt hash of a random secret nobody knows — login can never succeed again,
  // and password reset is impossible because the email is gone.
  const lockedHash = await hashPassword(randomBytes(24).toString('hex'))

  await prisma.$transaction(async (tx) => {
    // Financial records: keep the row, blank the personal fields.
    await tx.order.updateMany({
      where: { OR: [{ userId: id }, { email: emailLower }] },
      data: {
        firstName: 'Deleted', lastName: 'User', email: scrubbedEmail,
        phone: '', address: '', city: '', postalCode: null,
      },
    })

    await tx.returnRequest.updateMany({
      where: { email: emailLower },
      data: { firstName: 'Deleted', lastName: 'User', email: scrubbedEmail, phone: '' },
    })

    // Reviews are deliberately NOT touched here: Review has no userId FK, and a sweep by
    // the mutable `author` display name would overwrite every same-named user's reviews
    // (cross-account data loss). Review erasure is handled manually until a FK exists.

    // Pure-PII / intent records: remove entirely.
    await tx.savedAddress.deleteMany({ where: { email: emailLower } })
    await tx.wishlistItem.deleteMany({ where: { userId: id } })
    await tx.stockNotification.deleteMany({ where: { OR: [{ userId: id }, { email: emailLower }] } })
    await tx.productSubscription.deleteMany({ where: { OR: [{ userId: id }, { userEmail: emailLower }] } })
    await tx.accessRequest.deleteMany({ where: { email: emailLower } })
    await tx.companyMember.deleteMany({ where: { userId: id } })
    await tx.userNotification.deleteMany({ where: { userId: id } })
    // End every session (logs the account out everywhere).
    await tx.session.deleteMany({ where: { userId: id } })

    // Finally scrub the account itself and lock it.
    await tx.user.update({
      where: { id },
      data: {
        email: scrubbedEmail,
        name: null,
        phone: null,
        cardNumber: null,
        avatarUrl: null,
        companyId: null,
        companyName: null,
        teamRole: null,
        bonusPoints: 0,
        passwordHash: lockedHash,
        mustChangePassword: false,
      },
    })
  })

  // Marketing suppression lives in the KV store (outside the relational tx).
  await unsubscribeFromMarketing(emailLower)
}
