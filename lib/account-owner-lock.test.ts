import { describe, expect, it, vi } from 'vitest'
import { AccountOwnerMissingError, isAccountOwnerMissing, lockAccountOwner } from './account-owner-lock'

describe('lockAccountOwner', () => {
  it('takes FOR KEY SHARE on the owner row, like a foreign key would', async () => {
    const queryRaw = vi.fn(async () => [{ id: 'u1' }])
    await lockAccountOwner({ $queryRaw: queryRaw } as never, 'u1')
    const [strings, id] = queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, string]
    expect(strings.join('?')).toBe('SELECT id FROM "User" WHERE id = ? FOR KEY SHARE')
    expect(id).toBe('u1')
  })

  it('fails when the owner row is gone (merged away)', async () => {
    const error = await lockAccountOwner({ $queryRaw: vi.fn(async () => []) } as never, 'gone').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountOwnerMissingError)
    expect(isAccountOwnerMissing(error)).toBe(true)
    expect(isAccountOwnerMissing(new Error('other'))).toBe(false)
  })
})
