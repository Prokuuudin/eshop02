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
}

/** Assembles everything the platform holds about a data subject (Art. 15/20). */
export async function exportUserData(params: {
  id: string
  email: string
  name?: string | null
  companyId?: string | null
}): Promise<UserExport> {
  const { id, email, name, companyId } = params
  const emailLower = email.toLowerCase()

  const [profile, orders, reviews, savedAddresses, subscriptions, stockNotifications, returnRequests, invoices] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, name: true, phone: true, cardNumber: true, avatarUrl: true,
          platformRole: true, companyId: true, companyName: true, teamRole: true,
          bonusPoints: true, createdAt: true,
        },
      }),
      prisma.order.findMany({ where: { OR: [{ userId: id }, { email: emailLower }] }, orderBy: { createdAt: 'desc' } }),
      name ? prisma.review.findMany({ where: { author: name } }) : Promise.resolve([]),
      prisma.savedAddress.findMany({ where: { email: emailLower } }),
      prisma.productSubscription.findMany({ where: { OR: [{ userId: id }, { userEmail: emailLower }] } }),
      prisma.stockNotification.findMany({ where: { OR: [{ userId: id }, { email: emailLower }] } }),
      prisma.returnRequest.findMany({ where: { email: emailLower } }),
      companyId ? prisma.invoice.findMany({ where: { companyId } }) : Promise.resolve([]),
    ])

  return {
    exportedAt: new Date().toISOString(),
    profile: (profile ?? {}) as Record<string, unknown>,
    orders,
    invoices,
    reviews,
    savedAddresses,
    subscriptions,
    stockNotifications,
    returnRequests,
  }
}

/** Irreversibly anonymises the account and everything linked to it. */
export async function anonymizeUser(params: {
  id: string
  email: string
  name?: string | null
}): Promise<void> {
  const { id, email, name } = params
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

    // Reviews are public content — keep the text, drop the name (best-effort match by author).
    if (name) {
      await tx.review.updateMany({ where: { author: name }, data: { author: 'Аноним' } })
    }

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
