import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// Pure functions only: every query of the merge is exercised on real PostgreSQL in
// tests/integration/account-merge-postgres.integration.test.ts.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))

import {
  SECRET_USER_FIELDS,
  TARGET_RESTORE_COLUMNS,
  evaluateMergeBlockers,
  planProfile,
  type BlockerInput,
  type MergeUserRow,
} from './admin-account-merge'
import {
  LEGAL_FIELDS,
  NOT_USER_REFERENCES,
  PROFILE_FIELDS,
  USER_REFERENCES,
  referenceKey,
} from './admin-account-merge-references'

const legacy = (fields: Partial<MergeUserRow> = {}): MergeUserRow => ({
  id: 'legacy-1', email: 'anna@example.com', name: 'Anna Ozola', phone: null, avatarUrl: null, cardNumber: null, pkLast3: null,
  platformRole: 'customer', teamRole: null, superAdmin: false, companyId: null, companyName: null, customerType: 'individual',
  registrationNumber: null, vatNumber: null, legalAddress: null, bonusPoints: 0, mustChangePassword: true,
  privacyAcknowledgedAt: null, marketingConsent: false, marketingConsentAt: null, notificationChannel: 'app',
  notificationsSubscribed: false, mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [],
  cardRecoveryEmailHash: null, cardRecoveryPhoneHash: null, checkoutProfile: null,
  createdAt: new Date('2024-05-01T09:00:00.000Z'), updatedAt: new Date('2024-05-01T09:00:00.000Z'),
  ...fields,
})
const card = (fields: Partial<MergeUserRow> = {}): MergeUserRow => legacy({
  id: 'card-1', email: 'card.4242@client.local', phone: '20000001', cardNumber: '4242', pkLast3: '901',
  createdAt: new Date('2026-08-01T12:00:00.000Z'), updatedAt: new Date('2026-09-01T12:00:00.000Z'), ...fields,
})
const noRefs = Object.fromEntries(USER_REFERENCES.map((ref) => [referenceKey(ref), 0]))
const blockers = (overrides: Partial<BlockerInput> = {}) => {
  const source = overrides.source ?? legacy()
  const target = overrides.target ?? card()
  return evaluateMergeBlockers({
    source, target, sourceReferences: noRefs, sourceSettingsReferences: 0, sourceOpenOrders: 0, targetPendingTokens: 0,
    sourceHasRevokedCard: false, targetCardRevoked: false, profileConflicts: planProfile(source, target).conflicts,
    ...overrides,
  })
}

describe('USER_REFERENCES covers every user reference of the schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
  type Field = { model: string; name: string; type: string }
  const fields: Field[] = []
  const relations = new Set<string>()
  let model = ''
  for (const line of schema.split('\n')) {
    const header = /^\s*model\s+(\w+)\s*\{/u.exec(line)
    if (header) { model = header[1]; continue }
    if (/^\s*\}/u.test(line)) { model = ''; continue }
    const field = /^\s*(\w+)\s+(\w+)(\??|\[\])/u.exec(line)
    if (model && field && !field[1].startsWith('@')) fields.push({ model, name: field[1], type: field[2] })
    const relation = /^\s*\w+\s+User\??\s+@relation\(fields:\s*\[(\w+)\]/u.exec(line)
    if (model && relation) relations.add(`${model}.${relation[1]}`)
  }
  const registered = new Set(USER_REFERENCES.map(referenceKey))

  it('lists every foreign key to User', () => {
    expect([...relations].filter((key) => !registered.has(key))).toEqual([])
  })

  it('lists every column whose name says it holds a user (id, by, author, voter…)', () => {
    const idLike = fields.filter((f) => f.model !== 'User' && f.type === 'String' && /(userId|UserId|authorId|ById|By|voterKey)$/u.test(f.name))
    expect(idLike.map((f) => `${f.model}.${f.name}`).filter((key) => !registered.has(key))).toEqual([])
  })

  it('classifies every column that merely sounds like a person (author, admin, customer…)', () => {
    const personLike = fields.filter((f) => f.type === 'String' && /(user|author|actor|voter|owner|admin|customer|reviewer|member|creator|assignee|subject)/iu.test(f.name))
    const unclassified = personLike.map((f) => `${f.model}.${f.name}`).filter((key) => !registered.has(key) && !NOT_USER_REFERENCES.includes(key))
    expect(unclassified).toEqual([])
  })

  it('names only columns that exist', () => {
    const existing = new Set(fields.map((f) => `${f.model}.${f.name}`))
    expect([...registered, ...NOT_USER_REFERENCES].filter((key) => !existing.has(key))).toEqual([])
  })

  it('moves only owner data and never rewrites staff or audit history', () => {
    for (const ref of USER_REFERENCES) {
      if (ref.policy === 'move') expect(ref.role, referenceKey(ref)).toBe('owner')
      if (ref.role === 'actor') expect(ref.policy, referenceKey(ref)).toBe('block')
      if (ref.role === 'subject') expect(ref.policy, referenceKey(ref)).toBe('keep')
      if (ref.policy === 'block') expect(ref.blocker, referenceKey(ref)).toBeDefined()
    }
    expect(USER_REFERENCES.find((ref) => referenceKey(ref) === 'AuditLog.entityId')).toMatchObject({ policy: 'keep', match: 'auditSubject' })
    expect(USER_REFERENCES.find((ref) => referenceKey(ref) === 'ReviewHelpfulVote.voterKey')).toMatchObject({ policy: 'block', match: 'voterKey' })
  })

  it('every column of User has a policy or is a secret, a credential or account state', () => {
    const accountState = [
      'id', 'email', 'platformRole', 'companyId', 'teamRole', 'superAdmin', 'approvalRequired',
      'auditLoggingEnabled', 'cardNumber', 'customerType', 'bonusPoints', 'mustChangePassword', 'privacyNoticeVersion',
      'privacyAcknowledgedAt', 'mfaEnabled', 'mfaEnrolledAt', 'createdAt', 'updatedAt',
    ]
    const userColumns = fields.filter((f) => f.model === 'User' && /^(String|Boolean|Int|DateTime|Json)$/u.test(f.type)).map((f) => f.name)
    const covered = new Set<string>([...PROFILE_FIELDS, ...LEGAL_FIELDS, ...SECRET_USER_FIELDS, ...accountState])
    expect(userColumns.filter((column) => !covered.has(column))).toEqual([])
    // Everything a merge can change on the target is restored on undo.
    expect([...PROFILE_FIELDS, 'email', 'updatedAt'].sort()).toEqual([...TARGET_RESTORE_COLUMNS].sort())
  })
})

describe('evaluateMergeBlockers', () => {
  it('allows the plain legacy-into-card case', () => {
    expect(blockers()).toEqual([])
  })

  it.each([
    ['staff source', { source: legacy({ platformRole: 'admin' }) }, ['staff_account', 'not_customer']],
    ['manager source', { source: legacy({ teamRole: 'manager' }) }, ['staff_account']],
    ['super admin target', { target: card({ superAdmin: true }) }, ['staff_account']],
    ['source with card', { source: legacy({ cardNumber: '9999' }) }, ['source_has_card']],
    ['placeholder source email', { source: legacy({ email: 'card.1@client.local' }) }, ['source_no_email']],
    ['erased source', { source: legacy({ email: 'anon-x@deleted.invalid' }) }, ['source_erased']],
    ['privacy accepted', { source: legacy({ privacyAcknowledgedAt: new Date() }) }, ['source_activated']],
    ['own password set', { source: legacy({ mustChangePassword: false }) }, ['source_activated']],
    ['mfa enrolled', { source: legacy({ mfaEnabled: true }) }, ['source_activated']],
    ['card login secret', { source: legacy({ pkLast3: '123' }) }, ['source_secrets']],
    ['mfa secret without enrolment', { source: legacy({ mfaSecret: 'enc' }) }, ['source_secrets']],
    ['company link', { source: legacy({ companyId: 'c1' }) }, ['source_company']],
    ['company type', { source: legacy({ customerType: 'company' }) }, ['source_legal_details']],
    ['VAT number', { source: legacy({ vatNumber: 'LV40000000000' }) }, ['source_legal_details']],
    ['bonus balance', { source: legacy({ bonusPoints: 350 }) }, ['source_bonus_balance']],
    ['negative balance', { source: legacy({ bonusPoints: -5 }) }, ['source_bonus_balance']],
    ['revoked card history', { sourceHasRevokedCard: true }, ['source_revoked_card']],
    ['settings reference', { sourceSettingsReferences: 1 }, ['source_settings_reference']],
    ['open new-shop order', { sourceOpenOrders: 1 }, ['source_open_orders']],
    ['target without card', { target: card({ cardNumber: null }) }, ['target_no_card']],
    ['revoked target card', { targetCardRevoked: true }, ['target_card_revoked']],
    ['erased target', { target: card({ cardRecoveryEmailHash: 'h' }) }, ['target_erased']],
    ['open invitation on the target', { targetPendingTokens: 1 }, ['target_pending_tokens']],
    ['same account', { source: card(), target: card() }, ['same_account', 'source_has_card', 'source_no_email', 'source_secrets']],
  ] as Array<[string, Partial<BlockerInput>, string[]]>)('refuses: %s', (_label, overrides, expected) => {
    expect(blockers(overrides)).toEqual(expected)
  })

  it('refuses on every blocking reference with its own reason, never on moved or kept ones', () => {
    for (const ref of USER_REFERENCES) {
      const result = blockers({ sourceReferences: { ...noRefs, [referenceKey(ref)]: 2 } })
      if (ref.policy === 'block') expect(result, referenceKey(ref)).toEqual([ref.blocker])
      else expect(result, referenceKey(ref)).toEqual([])
    }
  })
})

describe('planProfile', () => {
  const item = (plan: ReturnType<typeof planProfile>, name: string) => plan.entries.find((e) => e.item === name)

  it('keeps the card account values and copies only what it lacks', () => {
    const plan = planProfile(
      legacy({ name: 'Anna Ozola', phone: '+37120000000', avatarUrl: '/a.png' }),
      card({ name: null, phone: '20000001' }),
    )
    expect(item(plan, 'name')?.action).toBe('copy_from_source')
    expect(item(plan, 'phone')?.action).toBe('keep_target')
    expect(item(plan, 'avatarUrl')?.action).toBe('copy_from_source')
    expect(plan.updates).toEqual({ name: 'Anna Ozola', avatarUrl: '/a.png' })
    expect(plan.conflicts).toEqual([])
  })

  it('copies a checkout profile onto an account without one and refuses two different ones', () => {
    const profile = { address: 'Iela 1', city: 'Rīga' }
    expect(planProfile(legacy({ checkoutProfile: profile }), card()).updates).toEqual({ checkoutProfile: profile })
    expect(planProfile(legacy({ checkoutProfile: profile }), card({ checkoutProfile: { ...profile } })).conflicts).toEqual([])
    const conflict = planProfile(legacy({ checkoutProfile: profile }), card({ checkoutProfile: { address: 'Cita 2' } }))
    expect(conflict.conflicts).toEqual(['checkoutProfile'])
    expect(blockers({ source: legacy({ checkoutProfile: profile }), target: card({ checkoutProfile: { address: 'Cita 2' } }) })).toEqual(['profile_conflict'])
  })

  it('carries a marketing consent with its date, never removes one', () => {
    const at = new Date('2025-01-02T03:04:05.000Z')
    expect(planProfile(legacy({ marketingConsent: true, marketingConsentAt: at }), card()).updates)
      .toEqual({ marketingConsent: true, marketingConsentAt: at })
    expect(planProfile(legacy(), card({ marketingConsent: true, marketingConsentAt: at })).updates).toEqual({})
  })

  it('carries non-default notification settings onto default ones', () => {
    expect(planProfile(legacy({ notificationChannel: 'email', notificationsSubscribed: true }), card()).updates)
      .toEqual({ notificationChannel: 'email', notificationsSubscribed: true })
    const both = planProfile(legacy({ notificationChannel: 'email' }), card({ notificationChannel: 'both' }))
    expect(both.updates).toEqual({})
    expect(item(both, 'notifications')?.action).toBe('keep_target')
  })

  it('shows the checkout profile only as present or not', () => {
    const plan = planProfile(legacy({ checkoutProfile: { iban: 'LV00TEST0000000000000' } }), card())
    expect(item(plan, 'checkoutProfile')).toEqual({ item: 'checkoutProfile', action: 'copy_from_source', source: 'set', target: null })
  })
})
