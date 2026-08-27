import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyAuditIntegrity } from './server-audit'

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`
}

function row(after: unknown, integrityHash: string) {
  return {
    id: 'audit-1',
    at: new Date('2026-08-24T11:40:37.284Z'),
    actorUserId: 'admin-1',
    adminEmail: 'admin@example.test',
    adminName: 'Admin',
    requestId: 'request-1',
    ipAddress: null,
    userAgent: null,
    sessionHash: null,
    action: 'promo.created',
    entityType: 'promo',
    entityId: 'promo-1',
    entityTitle: 'PROMO',
    before: null,
    after,
    details: null,
    reason: null,
    previousHash: null,
    integrityHash,
  }
}

describe('verifyAuditIntegrity', () => {
  it('accepts legacy hashes made before Date values were JSON-normalized', () => {
    const persistedAfter = { code: 'PROMO', createdAt: '2026-08-24T11:40:37.264Z' }
    const legacyPayload = {
      ...row(null, ''),
      at: '2026-08-24T11:40:37.284Z',
      after: { code: 'PROMO', createdAt: new Date(persistedAfter.createdAt) },
    }
    const { integrityHash: _hash, ...hashable } = legacyPayload
    const hash = createHash('sha256').update(canonical(hashable)).digest('hex')

    expect(verifyAuditIntegrity([row(persistedAfter, hash)])).toEqual({ valid: true, checked: 1 })
  })

  it('still rejects a genuinely changed payload', () => {
    expect(verifyAuditIntegrity([row({ code: 'CHANGED' }, 'invalid-hash')])).toEqual({
      valid: false,
      checked: 0,
      invalidId: 'audit-1',
    })
  })
})
