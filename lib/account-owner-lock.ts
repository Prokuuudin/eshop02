import type { ExtendedTransactionClient } from '@/lib/prisma'

/**
 * Owner lock for rows that store a User id in a column WITHOUT a foreign key (Order.userId,
 * PromoCodeRedemption.userId, WishlistItem.userId — see lib/admin-account-merge-references).
 *
 * A foreign key makes PostgreSQL take FOR KEY SHARE on the referenced User row; these columns
 * have none, so their writers take it themselves, inside the transaction that writes the row.
 * An account merge holds FOR UPDATE on the account it deletes: a writer for that account waits
 * until the merge ends and then finds the row gone (AccountOwnerMissingError) instead of
 * inserting a row that points at a deleted account. A writer that got the lock first makes the
 * merge wait, and the merge then moves the new row as well.
 */
export class AccountOwnerMissingError extends Error {
  constructor(public readonly userId: string) {
    super('account_owner_missing')
    this.name = 'AccountOwnerMissingError'
  }
}

/**
 * `expected.email`: the address a token is about to be mailed to. Re-checked on the locked row, so a
 * reset link or invitation is never issued for an account whose email a merge or its undo changed
 * meanwhile (the lock waits for that transaction; READ COMMITTED then sees the new address).
 */
export async function lockAccountOwner(
  tx: Pick<ExtendedTransactionClient, '$queryRaw'>,
  userId: string,
  expected?: { email: string },
): Promise<void> {
  const rows = expected
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} AND lower(email) = lower(${expected.email}) FOR KEY SHARE`
    : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} FOR KEY SHARE`
  if (rows.length !== 1) throw new AccountOwnerMissingError(userId)
}

/** Audit actors that are not accounts (e.g. `system:hairshop-catalog-sync`) have no row to lock. */
export const isSystemActorId = (id: string): boolean => id.startsWith('system:')

export const isAccountOwnerMissing = (error: unknown): error is AccountOwnerMissingError =>
  error instanceof AccountOwnerMissingError
