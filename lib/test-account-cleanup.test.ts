import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CLEANUP_TARGETS, detachedTestBonus, planTestAccountCleanup, type TargetState, type TestBonusRow, type TargetUser } from './test-account-cleanup'

const fixtureUser = (id: string, email: string, name: string, extra: Partial<TargetUser> = {}): TargetUser => ({
  id, email, name, platformRole: 'customer', teamRole: null, superAdmin: false, bonusPoints: 0, hasCard: false,
  mustChangePassword: false, mfaEnabled: false, hasMfaSecret: false, mfaBackupCodeCount: 0,
  createdAt: '2026-07-15T09:07:14.000Z', updatedAt: '2026-10-19T20:02:57.000Z', ...extra,
})
const row = (id: string, points: number, balanceAfter: number, extra: Partial<TestBonusRow> = {}): TestBonusRow => ({
  id, orderId: null, actorUserId: null, type: 'order_earn', points, balanceAfter, createdAt: `2026-08-11T08:53:${id.padStart(2, '0')}.000Z`, ...extra,
})
const customer = (bonusPoints: number) => fixtureUser('u_e2e_customer_fixture', 'e2e-customer@hairshoppro.lv.local', 'E2E Customer', { bonusPoints })

const states = (customerUser: TargetUser, bonusRows: TestBonusRow[], extraRefs: TargetState['references'] = []): TargetState[] =>
  CLEANUP_TARGETS.map((target) => ({
    target,
    user: target.id === 'u_e2e_customer_fixture' ? customerUser
      : target.id === 'seed_admin_001' ? fixtureUser('seed_admin_001', 'admin@test.com', 'Admin1234', { mfaEnabled: true, hasMfaSecret: true })
        : fixtureUser(target.id, target.email, target.id.includes('admin') ? 'E2E Admin' : 'E2E Manager'),
    references: target.id === 'u_e2e_customer_fixture'
      ? [{ table: 'BonusTransaction', column: 'userId', kind: 'business', count: bonusRows.length }, ...extraRefs]
      : [],
    neutralizedEarlier: false,
    bonusRows: target.id === 'u_e2e_customer_fixture' ? bonusRows : [],
  }))
const customerDecision = (s: TargetState[]) => planTestAccountCleanup(s).decisions.find((d) => d.id === 'u_e2e_customer_fixture')!

describe('detachedTestBonus', () => {
  it('accepts detached order credits whose last balance is the account balance', () => {
    expect(detachedTestBonus(customer(40), [row('1', 20, 20), row('2', 20, 40)])).toEqual({ ok: true })
    expect(detachedTestBonus(customer(0), [])).toEqual({ ok: true })
  })

  it('rejects rows still linked to an order, acted on by someone, or of another type', () => {
    expect(detachedTestBonus(customer(40), [row('1', 20, 20, { orderId: '1019' }), row('2', 20, 40)]).ok).toBe(false)
    expect(detachedTestBonus(customer(40), [row('1', 20, 20, { actorUserId: 'u-admin' }), row('2', 20, 40)]).ok).toBe(false)
    expect(detachedTestBonus(customer(40), [row('1', 20, 20, { type: 'admin_adjustment' }), row('2', 20, 40)]).ok).toBe(false)
  })

  it('rejects a balance the rows do not explain', () => {
    expect(detachedTestBonus(customer(45), [row('1', 20, 20), row('2', 20, 40)])).toMatchObject({ ok: false })
    expect(detachedTestBonus(customer(40), [])).toMatchObject({ ok: false })
  })
})

describe('planTestAccountCleanup', () => {
  it('deletes the customer fixture with its detached test bonus rows', () => {
    expect(customerDecision(states(customer(40), [row('1', 20, 20), row('2', 20, 40)])))
      .toMatchObject({ outcome: 'delete', reasons: ['test bonus rows=2 (20+20 points, balance 40)'] })
  })

  it('keeps blocking on linked bonus rows, a wrong balance or any other business reference', () => {
    expect(customerDecision(states(customer(40), [row('1', 20, 20, { orderId: '1019' }), row('2', 20, 40)])).outcome).toBe('blocked')
    expect(customerDecision(states(customer(41), [row('1', 20, 20), row('2', 20, 40)])).outcome).toBe('blocked')
    expect(customerDecision(states(customer(40), [row('1', 20, 20), row('2', 20, 40)], [
      { table: 'Order', column: 'userId', kind: 'business', count: 1 },
    ])).reasons).toEqual(['Order.userId=1'])
  })

  it('refuses the whole plan when a target is staff', () => {
    const s = states(customer(0), [])
    s[0] = { ...s[0], user: { ...s[0].user!, platformRole: 'admin' } }
    expect(planTestAccountCleanup(s).refused).toBe(true)
  })

  it('changes the fingerprint when the reviewed bonus rows change', () => {
    const a = planTestAccountCleanup(states(customer(40), [row('1', 20, 20), row('2', 20, 40)])).fingerprint
    const b = planTestAccountCleanup(states(customer(40), [row('1', 20, 20), row('3', 20, 40)])).fingerprint
    expect(a).not.toBe(b)
  })
})
