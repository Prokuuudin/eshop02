import { create } from 'zustand'
import { getCurrentUser, isAdminUser, type User } from '@/lib/auth'

/**
 * Single reactive source of truth for the current user.
 *
 * Replaces the old pattern of calling getCurrentUser() directly in many components and each
 * wiring its own `eshop-user-changed` listener. One listener (in AuthStoreProvider) refreshes
 * this store; components subscribe to it.
 *
 * `isHydrated` starts false on the server AND on the client's first render (no hydration
 * mismatch). AuthStoreProvider flips it to true in an effect after reading localStorage, so
 * auth-dependent UI can render a neutral placeholder until the real value is known — this kills
 * the "login prompt -> price" flash that logged-in users saw on every load.
 */
type AuthState = {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isHydrated: boolean
  /** Re-read the current user from storage. Called once on mount and on every auth change. */
  refresh: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isHydrated: false,
  refresh: () => {
    const user = getCurrentUser()
    const prev = get().user
    // Avoid needless re-renders while still reacting to changes on the same user.
    // Auth-change events also carry updates to the same user (profile edits,
    // dismissing the welcome modal, etc.). Keep every user field reactive.
    if (get().isHydrated && JSON.stringify(prev) === JSON.stringify(user)) return
    set({
      user,
      // Hard-blocked only when mustChangePassword is true AND the server
      // didn't mark this session passwordChangeSoft (see lib/auth-types.ts).
      isAuthenticated: !!user && !(user.mustChangePassword && !user.passwordChangeSoft),
      isAdmin: isAdminUser(user),
      isHydrated: true,
    })
  },
}))
