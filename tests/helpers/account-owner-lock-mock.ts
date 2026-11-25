import { vi } from 'vitest'

/**
 * Module factory for `vi.mock('@/lib/account-owner-lock', ...)` in tests that are not about the
 * owner lock: the lock always finds the account. The lock itself is covered by
 * lib/account-owner-lock.test.ts and tests/integration/account-merge-postgres.integration.test.ts.
 */
export async function accountOwnerLockPassthrough(): Promise<Record<string, unknown>> {
  const actual = await vi.importActual<typeof import('@/lib/account-owner-lock')>('@/lib/account-owner-lock')
  return { ...actual, lockAccountOwner: vi.fn(async () => undefined) }
}
