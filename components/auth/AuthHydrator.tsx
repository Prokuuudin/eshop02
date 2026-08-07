'use client'
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useWishlist } from '@/lib/wishlist-store'
import { CURRENT_KEY, getCurrentUser, notifyAuthChanged } from '@/lib/auth-storage'

export default function AuthHydrator(): ReactElement | null {
  const { idsByScope, addItem, productCache } = useWishlist()

  useEffect(() => {
    // One-time cleanup for drafts written by the retired access-request store.
    // Requests and certificates must only exist in the server-side database.
    localStorage.removeItem('access-request-store')

    const syncWishlist = (userId: string) => {
      // Merge DB wishlist IDs into store — only add IDs not already present locally
      fetch('/api/wishlist')
        .then((r) => r.json())
        .then(({ productIds }: { productIds: string[] }) => {
          if (!Array.isArray(productIds)) return
          const localIds = new Set(idsByScope[userId] ?? [])
          const missing = productIds.filter((id) => !localIds.has(id))
          // Can't fetch full product data here without product API —
          // mark IDs as known so they show up if product cache has them
          if (missing.length > 0) {
            // Re-use cached products where available
            for (const id of missing) {
              const cached = productCache[id]
              if (cached) addItem(cached)
            }
          }
        })
        .catch(() => {})
    }

    // Always confirm the cached login against the real server session, even when a
    // cached user is already present. The session cookie can expire or be revoked
    // (admin sessions last 1 day) while the localStorage cache never does on its own —
    // left unreconciled, the UI renders as "logged in" while the API redacts prices for
    // the now-unauthenticated request, showing "NaN" instead of a price.
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then(({ user }) => {
        const cached = getCurrentUser()
        if (!user) {
          if (cached) {
            localStorage.removeItem(CURRENT_KEY)
            notifyAuthChanged()
          }
          return
        }
        if (!cached || cached.id !== user.id) {
          localStorage.setItem(CURRENT_KEY, JSON.stringify({ ...user, password: '' }))
          notifyAuthChanged()
        }
        syncWishlist(user.id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
