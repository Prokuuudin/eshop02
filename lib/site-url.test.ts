import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSiteUrl } from './site-url'

afterEach(() => vi.unstubAllEnvs())

describe('getSiteUrl', () => {
  it('uses the explicitly configured canonical URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example/')
    expect(getSiteUrl()).toBe('https://shop.example')
  })

  it('uses trusted Vercel configuration, never a request Host header', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_URL', 'trusted-deployment.vercel.app')
    expect(getSiteUrl()).toBe('https://trusted-deployment.vercel.app')
  })

  it('fails closed in production when no trusted URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getSiteUrl()).toThrow(/must be configured/)
  })
})
