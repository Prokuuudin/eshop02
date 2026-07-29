'use client'
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useWishlist } from '@/lib/wishlist-store'

export default function AuthHydrator(): ReactElement | null {
  const { idsByScope, addItem, productCache } = useWishlist()

  useEffect(() => {
    // One-time cleanup for drafts written by the retired access-request store.
    // Requests and certificates must only exist in the server-side database.
    localStorage.removeItem('access-request-store')
    const stored = localStorage.getItem('currentUser')

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

    if (stored) {
      try {
        const user = JSON.parse(stored) as { id?: string }
        if (user.id) syncWishlist(user.id)
      } catch { /* ignore */ }
      return
    }

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then(({ user }) => {
        if (!user) return
        // NOTE: storing user in localStorage matches the existing app-wide auth pattern.
        // Migrating to server-only session state is a future task.
        localStorage.setItem('currentUser', JSON.stringify({ ...user, password: '' }))
        window.dispatchEvent(new Event('auth-changed'))
        syncWishlist(user.id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
