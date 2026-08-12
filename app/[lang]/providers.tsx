'use client'

import React, { useEffect, useRef } from 'react'
import { I18nProvider } from '@/lib/i18n-context'
import type { Language } from '@/data/translations'
import { ToastProvider } from '@/lib/toast-context'
import { useWishlist } from '@/lib/wishlist-store'
import { useCart } from '@/lib/cart-store'
import { seedTestAccounts } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'
import { useAdminStore } from '@/lib/admin-store'
import { setLocaleFormatConfig } from '@/lib/utils'
import FlyToCart from '@/components/FlyToCart'
import CookieConsent from '@/components/CookieConsent'
import TelemetryReporter from '@/components/TelemetryReporter'
import type { BonusProgramConfig } from '@/lib/bonus-program'
import type { LocaleConfig } from '@/lib/locale-config'

const CHUNK_ERROR_PATTERN = /(ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module)/i

function SeedAccounts(): null {
  useEffect(() => { seedTestAccounts() }, [])
  return null
}

// The single owner of the `eshop-user-changed` subscription. Hydrates the auth store once on
// mount and refreshes it on every auth change. Every other component reads useAuthStore instead
// of attaching its own listener.
function AuthStoreProvider(): null {
  useEffect(() => {
    const refresh = (): void => useAuthStore.getState().refresh()
    refresh()
    window.addEventListener('eshop-user-changed', refresh as EventListener)
    return () => window.removeEventListener('eshop-user-changed', refresh as EventListener)
  }, [])
  return null
}

// Bonus program config (rate/caps) is admin-configured but read by every guest and
// customer page (checkout, product, account) — hydrate the real value once app-wide
// instead of trusting whatever default is cached in this browser's localStorage.
function BonusConfigSync({ config }: { config: BonusProgramConfig }): null {
  useEffect(() => {
    useAdminStore.getState().setBonusProgram(config)
  }, [config])
  return null
}

// Date/price format + default-language settings are admin-configured (KV-backed) —
// hydrate the real value once app-wide so formatDate/formatEuro (lib/utils.ts)
// reflect it everywhere without threading a config prop through every call site.
function LocaleConfigSync({ config }: { config: LocaleConfig }): null {
  useEffect(() => {
    setLocaleFormatConfig(config)
  }, [config])
  return null
}

function WishlistScopeSync(): null {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isHydrated = useAuthStore((s) => s.isHydrated)

  useEffect(() => {
    if (!isHydrated) return
    useWishlist.getState().syncWishlistScope()
  }, [userId, isHydrated])

  return null
}

function CartUserSync(): null {
  const clearCart = useCart((state) => state.clearCart)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const prevUserId = useRef<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!isHydrated) return
    // Establish the baseline on first hydrated render; don't treat hydration as a user switch.
    if (!initialized.current) {
      initialized.current = true
      prevUserId.current = userId
      // Гость не может иметь корзину — выкидываем остатки, добавленные до auth-гейтов.
      if (userId === null) clearCart()
      return
    }
    if (userId !== prevUserId.current) {
      clearCart()
      prevUserId.current = userId
    }
  }, [userId, isHydrated, clearCart])

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

export function Providers({
  children,
  initialLanguage,
  bonusConfig,
  localeConfig,
}: {
  children: React.ReactNode
  initialLanguage?: Language
  bonusConfig: BonusProgramConfig
  localeConfig: LocaleConfig
}): React.ReactNode {
  return (
    <I18nProvider initialLanguage={initialLanguage} defaultLanguage={localeConfig.defaultLanguage}>
      <ToastProvider>
        <SeedAccounts />
        <AuthStoreProvider />
        <BonusConfigSync config={bonusConfig} />
        <LocaleConfigSync config={localeConfig} />
        <WishlistScopeSync />
        <CartUserSync />
        <ChunkErrorRecovery />
        <TelemetryReporter />
        <FlyToCart />
        <CookieConsent />
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}
