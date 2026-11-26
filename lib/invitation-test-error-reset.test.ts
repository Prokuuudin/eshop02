import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { LAUNCH_CUTOFF, planInvitationTestErrorReset, type ErrorTokenRow } from '@/lib/invitation-test-error-reset'

const row = (id: string, extra: Partial<ErrorTokenRow> = {}): ErrorTokenRow => ({
  id, userId: `user-${id}`, email: `${id}@example.test`, cardNumber: '100', language: 'lv', status: 'error',
  createdAt: '2026-08-04T21:14:41.322Z', expiresAt: '2026-08-11T21:14:40.901Z', acceptedAt: null,
  deliveriesBeforeLaunch: 0, auditEventsBeforeLaunch: 0, isLatestToken: true, listedInInvitations: true,
  ...extra,
})

describe('planInvitationTestErrorReset', () => {
  it('voids pre-launch test errors and counts those shown in the list', () => {
    const plan = planInvitationTestErrorReset([
      row('a'),
      row('b', { createdAt: '2026-09-08T11:42:20.051Z', listedInInvitations: false }),
    ], 3)

    expect(plan.refused).toBe(false)
    expect(plan.changes).toBe(2)
    expect(plan.visibleInList).toBe(1)
    expect(plan.postLaunchErrors).toBe(3)
    expect(plan.decisions.map((d) => d.outcome)).toEqual(['void', 'void'])
  })

  it('refuses the whole plan when a row looks like a work mailing', () => {
    const cases: Array<Partial<ErrorTokenRow>> = [
      { createdAt: LAUNCH_CUTOFF.toISOString() },
      { status: 'sent' },
      { acceptedAt: '2026-08-05T00:00:00.000Z' },
      { deliveriesBeforeLaunch: 1 },
      { auditEventsBeforeLaunch: 1 },
    ]
    for (const extra of cases) {
      const plan = planInvitationTestErrorReset([row('a'), row('b', extra)], 0)
      expect(plan.refused).toBe(true)
      expect(plan.decisions.find((d) => d.id === 'b')?.outcome).toBe('abort')
    }
  })

  it('changes the fingerprint when the candidate set changes', () => {
    const one = planInvitationTestErrorReset([row('a')], 0).fingerprint
    expect(planInvitationTestErrorReset([row('a')], 0).fingerprint).toBe(one)
    expect(planInvitationTestErrorReset([row('a'), row('b')], 0).fingerprint).not.toBe(one)
    expect(planInvitationTestErrorReset([row('a')], 1).fingerprint).not.toBe(one)
  })
})
