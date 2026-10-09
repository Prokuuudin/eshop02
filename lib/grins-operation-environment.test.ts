import { describe, expect, it, vi } from 'vitest'
import { resolveGrinsEnvironment, verifyGrinsEnvironment, withGrinsEnvironment, type GrinsEnvironmentRegistry } from './grins-operation-environment'

export const testRegistry: GrinsEnvironmentRegistry = { version: 1, environments: {
  staging: { instanceId: '11111111-1111-4111-8111-111111111111', hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' },
  production: { instanceId: '22222222-2222-4222-8222-222222222222', hosts: ['prod.example.invalid'], database: 'production', schema: 'public' },
} }
describe('independent environment identity', () => {
  it('rejects a production URL labelled staging before connecting', () => {
    expect(() => resolveGrinsEnvironment(testRegistry, 'staging', 'postgresql://synthetic@prod.example.invalid/production')).toThrow('database_identity_not_confirmed')
  })
  it('requires a separate exact production UUID confirmation', () => {
    expect(() => resolveGrinsEnvironment(testRegistry, 'production', 'postgresql://synthetic@prod.example.invalid/production')).toThrow('production_confirmation_required')
    expect(resolveGrinsEnvironment(testRegistry, 'production', 'postgresql://synthetic@prod.example.invalid/production', testRegistry.environments.production.instanceId).target).toBe('production')
  })
  it('rejects shared environment IDs and overlapping endpoint registries', () => {
    const copied = structuredClone(testRegistry)
    copied.environments.staging.instanceId = copied.environments.production.instanceId
    expect(() => resolveGrinsEnvironment(copied, 'staging', 'postgresql://synthetic@127.0.0.1/postgres')).toThrow('environment_registry_not_isolated')
  })
  it('rejects a production marker even if host and database appear correct', async () => {
    const expected = resolveGrinsEnvironment(testRegistry, 'staging', 'postgresql://synthetic@127.0.0.1/postgres')
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ database: 'postgres', schema: 'public' }]).mockResolvedValueOnce([{ value: { environment: 'production', instanceId: testRegistry.environments.production.instanceId } }]) }
    await expect(verifyGrinsEnvironment(tx as never, expected)).rejects.toThrow('database_environment_mismatch')
  })
  it('never runs the mutating action when marker is absent', async () => {
    const expected = resolveGrinsEnvironment(testRegistry, 'staging', 'postgresql://synthetic@127.0.0.1/postgres')
    const tx = { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ database: 'postgres', schema: 'public' }]).mockResolvedValueOnce([]) }
    const action = vi.fn()
    const db = { $transaction: vi.fn(fn => fn(tx)) }
    await expect(withGrinsEnvironment(db as never, expected, action)).rejects.toThrow('database_environment_mismatch')
    expect(action).not.toHaveBeenCalled()
  })
})
