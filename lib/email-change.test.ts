import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The integration suite runs on a single-backend PostgreSQL, where transactions never interleave.
// These tests reproduce the interleavings directly: another request has already won the race.
const { calls, tx, appendServerAuditMock } = vi.hoisted(() => {
  const calls: string[] = []
  const record = <T,>(name: string, value: T) => async () => { calls.push(name); return value }
  return {
    calls,
    appendServerAuditMock: vi.fn(),
    tx: {
      keyValueSetting: { findUnique: vi.fn(), deleteMany: vi.fn() },
      $executeRaw: vi.fn(record('lock', 1)),
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      companyMember: { updateMany: vi.fn() },
      savedAddress: { updateMany: vi.fn() },
      passwordResetToken: { deleteMany: vi.fn() },
      mfaChallenge: { deleteMany: vi.fn() },
      session: { deleteMany: vi.fn() },
    },
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: appendServerAuditMock }))
vi.mock('@/lib/server-auth', () => ({ mapDbToServerUser: (user: unknown) => user }))
vi.mock('@/lib/card-activation', () => ({ hasDeliverableEmail: () => true }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.test' }))

import { confirmEmailChange } from './email-change'

const USER_ID = 'user-1'
const SECRET = 'a'.repeat(64)
const TOKEN = `${Buffer.from(USER_ID).toString('base64url')}.${SECRET}`
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex')
const request = new NextRequest('http://localhost/api/user/email-change/confirm', { method: 'POST' })
const pending = {
  tokenHash: TOKEN_HASH, newEmail: 'new@example.test', currentEmail: 'old@example.test',
  expiresAt: new Date(Date.now() + 60_000).toISOString(), language: 'lv',
}
const nothingChanged = (): void => {
  expect(tx.user.update).not.toHaveBeenCalled()
  expect(tx.companyMember.updateMany).not.toHaveBeenCalled()
  expect(tx.savedAddress.updateMany).not.toHaveBeenCalled()
  expect(tx.session.deleteMany).not.toHaveBeenCalled()
  expect(appendServerAuditMock).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  tx.keyValueSetting.findUnique.mockImplementation(async () => { calls.push('read'); return { value: pending } })
  tx.keyValueSetting.deleteMany.mockImplementation(async () => { calls.push('consume'); return { count: 1 } })
  tx.user.findUnique.mockImplementation(async () => { calls.push('user'); return { id: USER_ID, email: pending.currentEmail } })
  tx.user.findFirst.mockImplementation(async () => { calls.push('uniqueness'); return null })
  tx.user.update.mockResolvedValue({})
})

describe('confirmEmailChange under concurrency', () => {
  it('stops when another request consumed the link after this one read it', async () => {
    tx.keyValueSetting.deleteMany.mockResolvedValue({ count: 0 })

    expect(await confirmEmailChange(TOKEN, request, null)).toBeNull()
    nothingChanged()
  })

  it('consumes conditionally on this token, so a replaced request cannot be taken', async () => {
    await confirmEmailChange(TOKEN, request, null)

    expect(tx.keyValueSetting.deleteMany).toHaveBeenCalledWith({
      where: { key: `email-change:${USER_ID}`, value: { path: ['tokenHash'], equals: TOKEN_HASH } },
    })
  })

  it('takes the address lock before checking uniqueness, and consumes first', async () => {
    await confirmEmailChange(TOKEN, request, null)

    expect(calls.indexOf('consume')).toBeLessThan(calls.indexOf('lock'))
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('uniqueness'))
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: { equals: 'new@example.test', mode: 'insensitive' }, NOT: { id: USER_ID } },
    }))
  })

  it('locks on the normalized address, so two accounts claiming it serialize', async () => {
    await confirmEmailChange(TOKEN, request, null)

    const [strings, key] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, string]
    expect(strings.join('?')).toContain('pg_advisory_xact_lock')
    expect(key).toBe('email-change:new@example.test')
  })

  it('refuses when the winner of the address is already committed', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'someone-else' })

    expect(await confirmEmailChange(TOKEN, request, null)).toBeNull()
    nothingChanged()
  })

  it('turns an exact-case unique conflict from a writer outside the lock into the same refusal', async () => {
    tx.user.update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    await expect(confirmEmailChange(TOKEN, request, null)).resolves.toBeNull()
  })

  it('does not swallow other database failures', async () => {
    tx.user.update.mockRejectedValue(new Error('connection lost'))

    await expect(confirmEmailChange(TOKEN, request, null)).rejects.toThrow('connection lost')
  })

  it('keeps only the confirming session, and only when one is given', async () => {
    await confirmEmailChange(TOKEN, request, 'session-hash')
    expect(tx.session.deleteMany).toHaveBeenLastCalledWith({ where: { userId: USER_ID, NOT: { tokenHash: 'session-hash' } } })

    await confirmEmailChange(TOKEN, request, null)
    expect(tx.session.deleteMany).toHaveBeenLastCalledWith({ where: { userId: USER_ID } })
  })
})
