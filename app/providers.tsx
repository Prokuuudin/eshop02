'use client'

import React, { useEffect } from 'react'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { useWishlist } from '@/lib/wishlist-store'

function WishlistScopeSync(): null {
  useEffect(() => {
    const syncWishlistScope = (): void => {
      useWishlist.getState().syncWishlistScope()
    }

    syncWishlistScope()
    window.addEventListener('eshop-user-changed', syncWishlistScope as EventListener)

    return () => {
      window.removeEventListener('eshop-user-changed', syncWishlistScope as EventListener)
    }
  }, [])

  return null
}

export function Providers({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <I18nProvider>
      <ToastProvider>
        <WishlistScopeSync />
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}
