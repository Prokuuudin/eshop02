import 'server-only'

type TurnstileResponse = { success?: boolean }

export class TurnstileConfigurationError extends Error {
  constructor() {
    super('NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be configured')
    this.name = 'TurnstileConfigurationError'
  }
}

/**
 * Production is always fail-closed. Outside production, Turnstile may be disabled by
 * leaving both keys empty, but a partial configuration is still rejected.
 */
export function isTurnstileRequired(): boolean {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ''
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() ?? ''
  const partiallyConfigured = Boolean(siteKey) !== Boolean(secretKey)
  if (partiallyConfigured || (process.env.NODE_ENV === 'production' && (!siteKey || !secretKey))) {
    throw new TurnstileConfigurationError()
  }
  return Boolean(siteKey && secretKey)
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const required = isTurnstileRequired()
  if (!required) return true
  if (!token.trim()) return false

  const form = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!.trim(),
    response: token.trim(),
  })
  if (ip && ip !== 'unknown') form.set('remoteip', ip)

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!response.ok) return false
    return Boolean(((await response.json()) as TurnstileResponse).success)
  } catch {
    return false
  }
}
