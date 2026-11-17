import 'server-only'

import type { ExtendedPrismaClient } from '@/lib/prisma'
import { normalizeCardNumber } from '@/lib/card-number'
import { recordAdminCardRevocation } from '@/lib/revoked-card-policy'

type RevocationTx = Pick<ExtendedPrismaClient, 'keyValueSetting' | '$executeRaw' | 'user' | 'session' | 'invitationToken'>

export type CardRevocationResult = {
  /** False when the number was already revoked (batch or admin); the card still moves off the customer. */
  recorded: boolean
  sessionsRevoked: number
  invitationsRevoked: number
}

/**
 * Takes a card away from a customer whose row the caller has locked (FOR UPDATE), in one
 * transaction:
 *  - records the number as revoked from the admin panel, so it is never issued again;
 *  - moves the customer to `nextCardNumber` (a replacement) or to no card at all;
 *  - voids every open invitation that carries the number or belongs to the customer, since
 *    accepting one writes its card number back onto the account;
 *  - ends the customer's sessions (the card may be lost or stolen).
 *
 * Card login, activation and invitations all reach a customer through User.cardNumber, so once
 * the number is off the account it stops working in this and in older releases alike. The
 * account, its orders and bonus points are not touched.
 */
export async function revokeCustomerCard(
  tx: RevocationTx,
  input: { userId: string; cardNumber: string; revokedBy: string; reason: string; nextCardNumber?: string | null; now?: Date },
): Promise<CardRevocationResult> {
  const cardNumber = normalizeCardNumber(input.cardNumber)
  const recorded = await recordAdminCardRevocation(tx, {
    cardNumber, userId: input.userId, revokedBy: input.revokedBy, reason: input.reason, now: input.now,
  })
  await tx.user.update({ where: { id: input.userId }, data: { cardNumber: input.nextCardNumber ?? null } })
  const invitations = await tx.invitationToken.deleteMany({
    where: { status: { not: 'accepted' }, OR: [{ userId: input.userId }, { cardNumber }] },
  })
  const sessions = await tx.session.deleteMany({ where: { userId: input.userId } })
  return { recorded, sessionsRevoked: sessions.count, invitationsRevoked: invitations.count }
}
