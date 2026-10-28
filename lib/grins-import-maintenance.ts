import type { ExtendedPrismaClient, ExtendedTransactionClient } from './prisma'

export const GRINS_CHECKOUT_GATE_KEY = 'grins-prices-only-maintenance'
type GateDb = Pick<ExtendedPrismaClient | ExtendedTransactionClient, '$queryRawUnsafe'>

export class CheckoutMaintenanceError extends Error {
  constructor() { super('checkout_maintenance'); this.name = 'CheckoutMaintenanceError' }
}

/** Explicit operator configuration, shared by every application process.
 * Missing/malformed configuration fails closed for new orders AND imports. */
export async function grinsMaintenanceClosed(db: GateDb): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ closed: boolean }>>(
    `SELECT (value->'checkoutClosed' = 'true'::jsonb) AS closed FROM "KeyValueSetting" WHERE key=$1`, GRINS_CHECKOUT_GATE_KEY,
  )
  return rows[0]?.closed === true
}

/** Outside transaction: reject fast instead of waiting behind Product writers.
 * Inside: FOR SHARE stays held until the order commits, so the operator's
 * UPDATE to close checkout drains all orders admitted while it was open. */
export async function assertGrinsCheckoutOpen(db: GateDb, holdUntilCommit = false): Promise<void> {
  const rows = await db.$queryRawUnsafe<Array<{ open: boolean }>>(
    `SELECT (value->'checkoutClosed' = 'false'::jsonb) AS open FROM "KeyValueSetting" WHERE key=$1${holdUntilCommit ? ' FOR SHARE' : ''}`, GRINS_CHECKOUT_GATE_KEY,
  )
  if (rows[0]?.open !== true) throw new CheckoutMaintenanceError()
}
