'use client'

import React, { useEffect } from 'react'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { useWishlist } from '@/lib/wishlist-store'

const CHUNK_ERROR_PATTERN = /(ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module)/i

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

function ChunkErrorRecovery(): null {
  useEffect(() => {
    const reloadOnceForPath = (): void => {
      const key = `eshop_chunk_reload_once:${window.location.pathname}`
      if (window.sessionStorage.getItem(key) === '1') return

      window.sessionStorage.setItem(key, '1')
      window.location.reload()
    }

    const handlePotentialChunkError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error ?? '')
      if (!CHUNK_ERROR_PATTERN.test(message)) return
      reloadOnceForPath()
    }

    const onError = (event: ErrorEvent): void => {
      handlePotentialChunkError(event.error ?? event.message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      handlePotentialChunkError(event.reason)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}

export function Providers({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <I18nProvider>
      <ToastProvider>
        <WishlistScopeSync />
        <ChunkErrorRecovery />
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}
