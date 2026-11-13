'use client'

import { useEffect } from 'react'
import { canAccessAdminPanel } from '@/lib/auth-access'
import { CURRENT_KEY, notifyAuthChanged } from '@/lib/auth-storage'
import { useAuthStore } from '@/lib/auth-store'
import { ADMIN_SESSION_HEARTBEAT_INTERVAL_MS } from '@/lib/admin-session-policy'

/**
 * Browser-presence heartbeat for staff sessions (lib/admin-session-policy.ts).
 * Runs on every page of the site while the signed-in user can reach the admin
 * panel; customers never send it. When the browser closes, the heartbeats stop
 * and the server ends the session a few minutes later, so restoring the previous
 * browser session (and its session cookie) still requires a new sign-in.
 *
 * Client-side only as UX: the server enforces every limit on its own. A 401 here
 * just clears the local mirror so the admin UI stops showing a signed-in state.
 */
export default function AdminSessionPresence(): null {
  const user = useAuthStore((s) => s.user)
  const staffUserId = user && canAccessAdminPanel(user) ? user.id : null

  useEffect(() => {
    if (!staffUserId) return

    let ended = false
    let deadlineTimer: number | undefined

    const endLocally = (): void => {
      if (ended) return
      ended = true
      localStorage.removeItem(CURRENT_KEY)
      notifyAuthChanged()
    }

    const beat = async (): Promise<void> => {
      if (ended) return
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (res.status === 401) {
          endLocally()
          return
        }
        if (!res.ok) return
        const body = (await res.json().catch(() => ({}))) as { absoluteExpiresAt?: string }
        const deadline = body.absoluteExpiresAt ? Date.parse(body.absoluteExpiresAt) : Number.NaN
        if (Number.isFinite(deadline)) {
          // At the 8-hour limit the server answers 401 and the UI signs out at once,
          // instead of waiting for the next periodic heartbeat.
          window.clearTimeout(deadlineTimer)
          deadlineTimer = window.setTimeout(() => void beat(), Math.max(0, deadline - Date.now()) + 1000)
        }
      } catch {
        // Offline or aborted: the next heartbeat retries; the server grace covers short gaps.
      }
    }

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void beat()
    }
    // A page restored from the back/forward cache never hit the server: re-check it.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) void beat()
    }
    const onOnline = (): void => void beat()
    // Sign-out in another tab removes the shared local user: follow it here too.
    const onStorage = (event: StorageEvent): void => {
      if (event.key === CURRENT_KEY || event.key === null) notifyAuthChanged()
    }

    void beat()
    const interval = window.setInterval(() => void beat(), ADMIN_SESSION_HEARTBEAT_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    window.addEventListener('storage', onStorage)

    return () => {
      ended = true
      window.clearInterval(interval)
      window.clearTimeout(deadlineTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('storage', onStorage)
    }
  }, [staffUserId])

  return null
}
