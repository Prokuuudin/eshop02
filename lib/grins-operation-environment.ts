import type { ExtendedPrismaClient, ExtendedTransactionClient } from './prisma'

export const GRINS_ENVIRONMENT_KEY = 'grins-deployment-environment'
export type GrinsTarget = 'staging' | 'production'
export type GrinsEnvironment = { target: GrinsTarget; instanceId: string; hosts: string[]; database: string; schema: string }
export type GrinsEnvironmentRegistry = { version: 1; environments: Record<GrinsTarget, Omit<GrinsEnvironment, 'target'>> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** Registry is an independently approved private file, never generated from
 * DATABASE_URL or caller-supplied --expected-host. Both environments required. */
export function resolveGrinsEnvironment(registry: unknown, target: string | undefined, connection: string | undefined, productionConfirmation?: string): GrinsEnvironment {
  const value = registry as GrinsEnvironmentRegistry | undefined
  if (value?.version !== 1 || !value.environments || !['staging', 'production'].includes(target ?? '')) throw new Error('environment_registry_invalid')
  for (const name of ['staging', 'production'] as const) {
    const row = value.environments[name]
    if (!row || !uuid.test(row.instanceId) || !row.database || !row.schema || !Array.isArray(row.hosts) || !row.hosts.length || row.hosts.some(host => typeof host !== 'string' || !host.trim())) throw new Error('environment_registry_invalid')
  }
  const staging = value.environments.staging, production = value.environments.production
  if (staging.instanceId === production.instanceId || staging.hosts.some(host => production.hosts.some(other => other.toLowerCase() === host.toLowerCase()))) throw new Error('environment_registry_not_isolated')
  const name = target as GrinsTarget
  const expected = { ...value.environments[name], target: name }
  if (name === 'production' && productionConfirmation !== expected.instanceId) throw new Error('production_confirmation_required')
  if (!connection) throw new Error('database_identity_not_confirmed')
  const url = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !expected.hosts.some(host => host.toLowerCase() === url.hostname.toLowerCase()) || decodeURIComponent(url.pathname.slice(1)) !== expected.database) throw new Error('database_identity_not_confirmed')
  return expected
}

export async function verifyGrinsEnvironment(db: Pick<ExtendedPrismaClient | ExtendedTransactionClient, '$queryRawUnsafe'>, expected: GrinsEnvironment): Promise<void> {
  const context = await db.$queryRawUnsafe<Array<{ database: string; schema: string }>>('SELECT current_database() AS database,current_schema() AS schema')
  if (context[0]?.database !== expected.database || context[0]?.schema !== expected.schema) throw new Error('database_context_mismatch')
  const rows = await db.$queryRawUnsafe<Array<{ value: unknown }>>('SELECT value FROM "KeyValueSetting" WHERE key=$1 FOR SHARE', GRINS_ENVIRONMENT_KEY)
  const marker = rows[0]?.value as { environment?: unknown; instanceId?: unknown } | undefined
  if (!marker || marker.environment !== expected.target || marker.instanceId !== expected.instanceId) throw new Error('database_environment_mismatch')
}

/** Caller passes the same transaction to setting writes. Marker FOR SHARE is
 * retained until commit so identity cannot change during the operation. */
export async function withGrinsEnvironment<T>(db: ExtendedPrismaClient, expected: GrinsEnvironment, action: (tx: ExtendedTransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT set_config('lock_timeout','10000',true)")
    await verifyGrinsEnvironment(tx, expected)
    return action(tx)
  }, { timeout: 30_000, maxWait: 10_000 })
}

/** Operator-only facade: identity verified inside every core transaction,
 * without an extra long-running outer connection or nested transactions. */
export function guardGrinsTransactions(db: ExtendedPrismaClient, expected: GrinsEnvironment): ExtendedPrismaClient {
  const transaction = db.$transaction.bind(db)
  return new Proxy(db, { get(client, property) {
    if (property === '$transaction') return (fn: (tx: ExtendedTransactionClient) => Promise<unknown>, options?: unknown) => Reflect.apply(transaction, client, [async (tx: ExtendedTransactionClient) => {
      await tx.$executeRawUnsafe("SELECT set_config('lock_timeout','10000',true)")
      await verifyGrinsEnvironment(tx, expected)
      return fn(tx)
    }, options])
    return Reflect.get(client, property)
  } })
}

export function safeGrinsOperationError(error: unknown): string {
  if (error instanceof Error && error.message === 'checkout_maintenance') return 'checkout_maintenance'
  const codes = ['environment_registry_invalid', 'environment_registry_not_isolated', 'production_confirmation_required', 'database_identity_not_confirmed', 'database_context_mismatch', 'database_environment_mismatch', 'explicit_target_database_and_state_required', 'initial_open_state_confirmation_required', 'checkout_state_missing_release_blocked', 'checkout_state_unexpected_release_blocked', 'invalid_checkout_state', 'checkout_state_initialization_unverified', 'checkout_gate_missing', 'checkout_state_invalid', 'import_active', 'lease_active', 'completed_run_required', 'completion_not_verified', 'initial_state_not_confirmed', 'admin_actor_required', 'maintenance_required', 'operator_confirmation_required']
  return error instanceof Error && codes.includes(error.message) ? error.message : 'operation_not_verified'
}
