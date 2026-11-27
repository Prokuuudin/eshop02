import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  invitationOptOutAvailable,
  invitationOptOutToken,
  invitationOptOutUrl,
  verifyInvitationOptOutToken,
} from '@/lib/invitation-suppression'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('invitation opt-out signing secret', () => {
  it('is unavailable in production without NEWSLETTER_UNSUB_SECRET, and signing a link throws', () => {
    // Regression 2026-11-27: production had no secret, invitationOptOutUrl threw after the tokens were committed.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEWSLETTER_UNSUB_SECRET', '   ')

    expect(invitationOptOutAvailable()).toBe(false)
    expect(() => invitationOptOutUrl('user-1', 'lv', 'https://shop.test')).toThrow('NEWSLETTER_UNSUB_SECRET is required in production')
  })

  it('is available in production with the secret; the signed link verifies only for its own client', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEWSLETTER_UNSUB_SECRET', 'test-secret-for-signing')

    expect(invitationOptOutAvailable()).toBe(true)
    const url = new URL(invitationOptOutUrl('user-1', 'lv', 'https://shop.test/'))
    expect(url.pathname).toBe('/lv/invitation-opt-out')
    const token = url.searchParams.get('token') ?? ''
    expect(token).toBe(invitationOptOutToken('user-1'))
    expect(verifyInvitationOptOutToken('user-1', token)).toBe(true)
    expect(verifyInvitationOptOutToken('user-2', token)).toBe(false)
  })

  it('falls back to an ephemeral secret outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEWSLETTER_UNSUB_SECRET', '')

    expect(invitationOptOutAvailable()).toBe(true)
    expect(verifyInvitationOptOutToken('user-1', invitationOptOutToken('user-1'))).toBe(true)
  })
})
