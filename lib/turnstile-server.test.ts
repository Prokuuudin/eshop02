import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { isTurnstileRequired, TurnstileConfigurationError } from './turnstile-server'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Turnstile configuration', () => {
  it('fails closed in production when both keys are absent', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(() => isTurnstileRequired()).toThrow(TurnstileConfigurationError)
  })

  it.each([
    ['site-key', ''],
    ['', 'secret-key'],
  ])('rejects a partial configuration', (siteKey, secretKey) => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', siteKey)
    vi.stubEnv('TURNSTILE_SECRET_KEY', secretKey)
    expect(() => isTurnstileRequired()).toThrow(TurnstileConfigurationError)
  })

  it('requires verification when both keys are configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-key')
    expect(isTurnstileRequired()).toBe(true)
  })

  it('allows explicit local disablement only when both keys are absent', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(isTurnstileRequired()).toBe(false)
  })
})
