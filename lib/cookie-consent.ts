export type CookieConsentValue = {
  necessary: true
  analytics: boolean
  marketing: boolean
  ts: number
}

export const COOKIE_CONSENT_KEY = 'cookie_consent'
export const COOKIE_CONSENT_CHANGED_EVENT = 'eshop-cookie-consent-changed'

type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>

export function parseCookieConsent(raw: string | null): CookieConsentValue | null {
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<CookieConsentValue>
    if (
      value.necessary !== true
      || typeof value.analytics !== 'boolean'
      || typeof value.marketing !== 'boolean'
      || typeof value.ts !== 'number'
      || !Number.isFinite(value.ts)
    ) {
      return null
    }
    return value as CookieConsentValue
  } catch {
    return null
  }
}

export function getCookieConsent(storage?: ConsentStorage): CookieConsentValue | null {
  if (!storage && typeof window === 'undefined') return null

  try {
    return parseCookieConsent((storage ?? window.localStorage).getItem(COOKIE_CONSENT_KEY))
  } catch {
    return null
  }
}

export function saveCookieConsent(
  analytics: boolean,
  marketing: boolean,
  storage?: ConsentStorage
): CookieConsentValue {
  const value: CookieConsentValue = { necessary: true, analytics, marketing, ts: Date.now() }
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  target?.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value))

  if (!storage && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CookieConsentValue>(COOKIE_CONSENT_CHANGED_EVENT, { detail: value }))
  }

  return value
}
