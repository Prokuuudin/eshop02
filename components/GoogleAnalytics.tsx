'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  GA4_MEASUREMENT_ID,
  GA4_READY_EVENT,
  GA4_SCRIPT_ID,
  isGa4Host,
  isPayseraReturn,
  revokeGa4Runtime,
  setGa4Operational,
} from '@/lib/analytics'
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  getCookieConsent,
  type CookieConsentValue,
} from '@/lib/cookie-consent'

const LAST_INTERNAL_LOCATION_KEY = 'eshop_ga4_last_internal_location'

function setGaDisabled(disabled: boolean): void {
  const flag = `ga-disable-${GA4_MEASUREMENT_ID}`
  ;(window as unknown as Record<string, unknown>)[flag] = disabled
}

function removeGaCookies(): void {
  const host = window.location.hostname
  const parentDomain = host.endsWith('hairshoppro.lv') ? '.hairshoppro.lv' : undefined
  for (const name of document.cookie.split(';').map((part) => part.split('=')[0]?.trim()).filter(Boolean)) {
    if (!name.startsWith('_ga')) continue
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${host}; SameSite=Lax`
    if (parentDomain) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${parentDomain}; SameSite=Lax`
  }
}

function removeGaClientStorage(): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    for (const key of keys) {
      if (key?.startsWith('eshop_ga4_')) window.localStorage.removeItem(key)
    }
    window.sessionStorage.removeItem(LAST_INTERNAL_LOCATION_KEY)
  } catch {
    // Storage may be unavailable in hardened browser modes.
  }
}

function configureGtag(ignoreReferrer: boolean): void {
  window.dataLayer = window.dataLayer ?? []
  window.gtag = window.gtag ?? function gtag(...args: unknown[]): void {
    window.dataLayer?.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  if (ignoreReferrer) window.gtag('set', 'ignore_referrer', true)
  window.gtag('config', GA4_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
}

function ensureGtagScript(onLoad: () => void, onError: () => void): () => void {
  const existing = document.getElementById(GA4_SCRIPT_ID) as HTMLScriptElement | null
  const script = existing ?? document.createElement('script')
  if (script.dataset.ga4Loaded === 'true') {
    queueMicrotask(onLoad)
    return () => undefined
  }

  const handleLoad = (): void => {
    script.dataset.ga4Loaded = 'true'
    onLoad()
  }
  script.addEventListener('load', handleLoad)
  script.addEventListener('error', onError)
  if (!existing) {
    script.id = GA4_SCRIPT_ID
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`
    document.head.appendChild(script)
  }
  return () => {
    script.removeEventListener('load', handleLoad)
    script.removeEventListener('error', onError)
  }
}

export default function GoogleAnalytics(): null {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = useMemo(() => searchParams.toString(), [searchParams])
  const [consentRevision, setConsentRevision] = useState(0)
  const [configured, setConfigured] = useState(false)
  const configuredRef = useRef(false)
  const revokedInDocumentRef = useRef(false)
  const lastPageRef = useRef('')

  useEffect(() => {
    const onConsentChanged = (event: Event): void => {
      const consent = (event as CustomEvent<CookieConsentValue>).detail
      if (!consent.analytics) {
        const hadGaRuntime = configuredRef.current
          || Boolean(document.getElementById(GA4_SCRIPT_ID))
          || typeof window.gtag === 'function'
        revokeGa4Runtime()
        document.getElementById(GA4_SCRIPT_ID)?.remove()
        removeGaCookies()
        removeGaClientStorage()
        revokedInDocumentRef.current = hadGaRuntime
        configuredRef.current = false
        setConfigured(false)
        lastPageRef.current = ''
      } else if (revokedInDocumentRef.current) {
        // A loaded Google tag cannot be unloaded safely. Reloading after the saved
        // choice prevents stale listeners or pre-revoke commands from resuming.
        window.location.reload()
        return
      }
      setConsentRevision((value) => value + 1)
    }
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsentChanged)
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsentChanged)
  }, [])

  useEffect(() => {
    if (!isGa4Host(window.location.hostname) || !getCookieConsent()?.analytics) return

    setGaDisabled(false)
    if (configuredRef.current) return
    configureGtag(isPayseraReturn(window.location.pathname, window.location.search, document.referrer))
    configuredRef.current = true
    return ensureGtagScript(
      () => {
        if (!getCookieConsent()?.analytics) return
        setGa4Operational(true)
        setConfigured(true)
        window.dispatchEvent(new Event(GA4_READY_EVENT))
      },
      () => {
        setGa4Operational(false)
        configuredRef.current = false
        document.getElementById(GA4_SCRIPT_ID)?.remove()
      }
    )
  }, [consentRevision])

  useEffect(() => {
    if (!configured || !getCookieConsent()?.analytics || typeof window.gtag !== 'function') return

    const pageLocation = `${window.location.origin}${pathname}${search ? `?${search}` : ''}`
    if (lastPageRef.current === pageLocation) return

    let previousInternalLocation = ''
    try {
      previousInternalLocation = window.sessionStorage.getItem(LAST_INTERNAL_LOCATION_KEY) ?? ''
    } catch {
      // Session storage is an attribution enhancement, not a tracking prerequisite.
    }

    const payseraReturn = isPayseraReturn(pathname, search, document.referrer)
    const pageReferrer = previousInternalLocation || (payseraReturn ? '' : document.referrer)
    window.gtag('event', 'page_view', {
      send_to: GA4_MEASUREMENT_ID,
      page_title: document.title,
      page_location: pageLocation,
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
      ...(payseraReturn ? { ignore_referrer: true } : {}),
    })

    lastPageRef.current = pageLocation
    try {
      window.sessionStorage.setItem(LAST_INTERNAL_LOCATION_KEY, pageLocation)
    } catch {
      // Keep page view collection working if sessionStorage is unavailable.
    }
  }, [configured, pathname, search])

  return null
}
