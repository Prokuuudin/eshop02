'use client'

import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { CURRENT_KEY, getCurrentUser, notifyAuthChanged } from '@/lib/auth-storage'

export default function AuthHydrator(): ReactElement | null {
  useEffect(() => {
    localStorage.removeItem('access-request-store')

    // Guests have no cached identity to validate. Skipping this request removes an
    // unnecessary auth/database round trip from the common public-page path.
    const cached = getCurrentUser()
    if (!cached) return

    fetch('/api/auth/me')
      .then((response) => response.json())
      .then(({ user }) => {
        if (!user) {
          localStorage.removeItem(CURRENT_KEY)
          notifyAuthChanged()
          return
        }
        if (cached.id !== user.id) {
          localStorage.setItem(CURRENT_KEY, JSON.stringify({ ...user, password: '' }))
          notifyAuthChanged()
        }
      })
      .catch(() => {})
  }, [])

  return null
}
