import type { ExtendedPrismaClient } from './prisma'
import { GRINS_CHECKOUT_GATE_KEY } from './grins-import-maintenance'

type StateDb = Pick<ExtendedPrismaClient, '$queryRawUnsafe'>
type InitDb = StateDb & Pick<ExtendedPrismaClient, '$executeRawUnsafe'>

export async function readGrinsCheckoutState(db: StateDb): Promise<boolean | 'missing'> {
  const rows = await db.$queryRawUnsafe<Array<{ value: unknown }>>('SELECT value FROM "KeyValueSetting" WHERE key=$1', GRINS_CHECKOUT_GATE_KEY)
  if (!rows.length) return 'missing'
  const value = rows[0].value
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { checkoutClosed?: unknown }).checkoutClosed !== 'boolean') {
    throw new Error('invalid_checkout_state')
  }
  return (value as { checkoutClosed: boolean }).checkoutClosed
}

/** Explicit release-preparation action only. Never called by checkout/startup.
 * The unique key serializes concurrent inserts; an existing closed or malformed
 * row is never replaced. Runtime continues to fail closed for missing state. */
export async function initializeGrinsCheckoutState(db: InitDb): Promise<{ created: boolean; checkoutClosed: boolean }> {
  const affected = await db.$executeRawUnsafe(
    `INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ($1,'{"checkoutClosed":false}'::jsonb,now()) ON CONFLICT (key) DO NOTHING`,
    GRINS_CHECKOUT_GATE_KEY,
  )
  const checkoutClosed = await readGrinsCheckoutState(db)
  if (checkoutClosed === 'missing') throw new Error('checkout_state_initialization_unverified')
  return { created: affected === 1, checkoutClosed }
}
