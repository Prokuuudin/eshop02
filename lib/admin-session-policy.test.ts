import { describe, expect, it } from 'vitest'
import {
  ADMIN_SESSION_HEARTBEAT_INTERVAL_MS,
  ADMIN_SESSION_MAX_AGE_MS,
  ADMIN_SESSION_PRESENCE_GRACE_MS,
  ADMIN_SESSION_PRESENCE_REFRESH_MS,
  adminSessionAbsoluteDeadline,
  adminSessionPresenceDeadline,
  evaluateAdminSession,
  shouldRefreshAdminPresence,
} from './admin-session-policy'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const signIn = new Date('2026-11-13T08:00:00.000Z')
const at = (offsetMs: number) => new Date(signIn.getTime() + offsetMs)

describe('admin session policy', () => {
  it('has the agreed limits: 8 hours absolute, heartbeats well inside the presence grace', () => {
    expect(ADMIN_SESSION_MAX_AGE_MS).toBe(8 * HOUR)
    expect(ADMIN_SESSION_PRESENCE_GRACE_MS).toBeGreaterThanOrEqual(2 * ADMIN_SESSION_HEARTBEAT_INTERVAL_MS)
    expect(ADMIN_SESSION_PRESENCE_REFRESH_MS).toBeLessThan(ADMIN_SESSION_HEARTBEAT_INTERVAL_MS)
  })

  it('computes the absolute deadline from the sign-in time', () => {
    expect(adminSessionAbsoluteDeadline(signIn)).toEqual(at(8 * HOUR))
  })

  it('caps the presence deadline at the absolute deadline', () => {
    expect(adminSessionPresenceDeadline(signIn, at(HOUR))).toEqual(at(HOUR + ADMIN_SESSION_PRESENCE_GRACE_MS))
    expect(adminSessionPresenceDeadline(signIn, at(8 * HOUR - MINUTE))).toEqual(at(8 * HOUR))
  })

  it('is active while both limits hold', () => {
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(HOUR + MINUTE) }, at(HOUR))).toBe('active')
  })

  it('ends at exactly 8 hours, whatever the presence deadline says', () => {
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(8 * HOUR) }, at(8 * HOUR))).toBe('max_age_reached')
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(8 * HOUR) }, at(8 * HOUR - 1))).toBe('active')
  })

  it('ends when the browser stopped reporting presence (browser closed)', () => {
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(HOUR) }, at(HOUR))).toBe('presence_lapsed')
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(HOUR) }, at(3 * HOUR))).toBe('presence_lapsed')
  })

  it('does not honour sessions issued outside the policy', () => {
    // Pre-policy admin session: one day.
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(24 * HOUR) }, at(HOUR))).toBe('not_issued_by_policy')
    // Presence deadline far beyond the grace window.
    expect(evaluateAdminSession({ createdAt: signIn, expiresAt: at(HOUR + 30 * MINUTE) }, at(HOUR))).toBe('not_issued_by_policy')
    expect(evaluateAdminSession({ createdAt: new Date('invalid'), expiresAt: at(HOUR) }, at(0))).toBe('not_issued_by_policy')
  })

  it('refreshes presence only when it moves the deadline by at least the refresh step', () => {
    const now = at(HOUR)
    const fresh = { createdAt: signIn, expiresAt: new Date(now.getTime() + ADMIN_SESSION_PRESENCE_GRACE_MS - 1000) }
    const stale = { createdAt: signIn, expiresAt: new Date(now.getTime() + ADMIN_SESSION_PRESENCE_GRACE_MS - ADMIN_SESSION_PRESENCE_REFRESH_MS) }
    expect(shouldRefreshAdminPresence(fresh, now)).toBe(false)
    expect(shouldRefreshAdminPresence(stale, now)).toBe(true)
  })

  it('stops refreshing once the deadline already sits at the 8-hour limit', () => {
    const now = at(8 * HOUR - MINUTE)
    expect(shouldRefreshAdminPresence({ createdAt: signIn, expiresAt: at(8 * HOUR) }, now)).toBe(false)
  })
})
