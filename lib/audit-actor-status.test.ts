import { describe, expect, it } from 'vitest'
import { auditActorLookups, classifyAuditActors, mergeAuditActorStatuses } from './audit-actor-status'

const users = [
  { id: 'u-admin', email: 'boss@example.test', platformRole: 'admin', teamRole: null },
  { id: 'u-manager', email: 'staff@example.test', platformRole: 'customer', teamRole: 'manager' },
  { id: 'u-revoked', email: 'old-admin@example.test', platformRole: 'customer', teamRole: null },
  { id: 'u-b2b-owner', email: 'owner@example.test', platformRole: 'customer', teamRole: 'admin' },
  { id: 'u-new-holder', email: 'reused@example.test', platformRole: 'admin', teamRole: null },
]

describe('classifyAuditActors', () => {
  it('labels current staff, revoked accounts and deleted actors', () => {
    expect(classifyAuditActors([
      { adminEmail: 'boss@example.test', actorUserId: 'u-admin' },
      { adminEmail: 'staff@example.test', actorUserId: 'u-manager' },
      { adminEmail: 'old-admin@example.test', actorUserId: 'u-revoked' },
      { adminEmail: 'owner@example.test', actorUserId: 'u-b2b-owner' },
      { adminEmail: 'gone@example.invalid', actorUserId: 'u-gone' },
    ], users)).toEqual({
      'boss@example.test': 'staff',
      'staff@example.test': 'staff',
      'old-admin@example.test': 'former',
      // a B2B company "admin" has no admin-panel access
      'owner@example.test': 'former',
      'gone@example.invalid': 'deleted',
    })
  })

  it('trusts the recorded actor id over a reused e-mail', () => {
    expect(classifyAuditActors([{ adminEmail: 'reused@example.test', actorUserId: 'u-deleted' }], users))
      .toEqual({ 'reused@example.test': 'deleted' })
  })

  it('falls back to a case-insensitive e-mail match only when no actor id was recorded', () => {
    expect(classifyAuditActors([
      { adminEmail: 'Boss@Example.test', actorUserId: null },
      { adminEmail: 'system', actorUserId: null },
    ], users)).toEqual({ 'Boss@Example.test': 'staff', system: 'unknown' })
  })

  it('keeps the most privileged standing when one e-mail covers several actors', () => {
    expect(classifyAuditActors([
      { adminEmail: 'boss@example.test', actorUserId: 'u-gone' },
      { adminEmail: 'boss@example.test', actorUserId: 'u-admin' },
    ], users)).toEqual({ 'boss@example.test': 'staff' })
  })
})

describe('auditActorLookups / mergeAuditActorStatuses', () => {
  it('looks up ids, and e-mails only for entries without an id', () => {
    expect(auditActorLookups([
      { adminEmail: 'a@example.test', actorUserId: 'u1' },
      { adminEmail: 'a@example.test', actorUserId: 'u1' },
      { adminEmail: 'B@example.test', actorUserId: null },
    ])).toEqual({ ids: ['u1'], emails: ['b@example.test'] })
  })

  it('merges pages without downgrading a status', () => {
    expect(mergeAuditActorStatuses(
      { a: 'staff', b: 'deleted' },
      { a: 'former', b: 'former', c: 'unknown' },
      undefined,
    )).toEqual({ a: 'staff', b: 'former', c: 'unknown' })
  })
})
