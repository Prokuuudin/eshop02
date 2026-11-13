/**
 * Session policy for accounts that reach the admin panel (platform admins,
 * super admins and staff managers — see requiresAdminMfa in lib/server-auth.ts).
 * Customer sessions are not affected by anything in this file.
 *
 * Two server-side limits, both stored in the existing Session columns (no schema change):
 *
 * - Absolute limit: a staff session ends ADMIN_SESSION_MAX_AGE_MS after sign-in
 *   (Session.createdAt), whatever the activity. Rotating the token (password
 *   change) keeps the original sign-in time.
 *
 * - Browser presence: Session.expiresAt is a short presence deadline. Every
 *   authenticated request, and a heartbeat sent by any open page of the site
 *   (components/auth/AdminSessionPresence.tsx), moves it forward. When the browser
 *   is closed nothing moves it, so the session ends ADMIN_SESSION_PRESENCE_GRACE_MS
 *   later on the server. This is what makes a browser restart require a new sign-in
 *   even when the browser restores its session cookies ("continue where you left
 *   off"). It is not an inactivity timeout: an open but untouched tab keeps it alive.
 */

export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
export const ADMIN_SESSION_PRESENCE_GRACE_MS = 3 * 60 * 1000
/** Requests do not rewrite the session row more often than this. */
export const ADMIN_SESSION_PRESENCE_REFRESH_MS = 30 * 1000
/**
 * Client heartbeat period. Background tabs may run timers only once a minute,
 * which still leaves several heartbeats inside the grace window.
 */
export const ADMIN_SESSION_HEARTBEAT_INTERVAL_MS = 60 * 1000
// A presence deadline further ahead than the grace (plus this margin) was not
// issued under this policy.
const PRESENCE_DEADLINE_MARGIN_MS = 60 * 1000

export type AdminSessionTimes = { createdAt: Date; expiresAt: Date }
export type AdminSessionState = 'active' | 'presence_lapsed' | 'max_age_reached' | 'not_issued_by_policy'

export function adminSessionAbsoluteDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ADMIN_SESSION_MAX_AGE_MS)
}

/** Next presence deadline: the grace window from now, never past the absolute limit. */
export function adminSessionPresenceDeadline(createdAt: Date, now: Date): Date {
  const absolute = adminSessionAbsoluteDeadline(createdAt).getTime()
  return new Date(Math.min(now.getTime() + ADMIN_SESSION_PRESENCE_GRACE_MS, absolute))
}

export function evaluateAdminSession(session: AdminSessionTimes, now: Date): AdminSessionState {
  const createdAt = session.createdAt.getTime()
  const expiresAt = session.expiresAt.getTime()
  const nowMs = now.getTime()
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return 'not_issued_by_policy'
  if (nowMs >= createdAt + ADMIN_SESSION_MAX_AGE_MS) return 'max_age_reached'
  if (expiresAt <= nowMs) return 'presence_lapsed'
  // Sessions issued before this policy (1-day admin sessions) or by any path that
  // did not apply it carry a far deadline: they are not honoured.
  if (expiresAt > createdAt + ADMIN_SESSION_MAX_AGE_MS) return 'not_issued_by_policy'
  if (expiresAt > nowMs + ADMIN_SESSION_PRESENCE_GRACE_MS + PRESENCE_DEADLINE_MARGIN_MS) return 'not_issued_by_policy'
  return 'active'
}

/** True when moving the presence deadline forward is worth a database write. */
export function shouldRefreshAdminPresence(session: AdminSessionTimes, now: Date): boolean {
  const next = adminSessionPresenceDeadline(session.createdAt, now).getTime()
  return next - session.expiresAt.getTime() >= ADMIN_SESSION_PRESENCE_REFRESH_MS
}
