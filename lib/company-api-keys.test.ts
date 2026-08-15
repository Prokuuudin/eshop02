import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  companyApiKey: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: client }))

import { generateCompanyApiKey, getCompanyApiKeyMeta, revokeCompanyApiKey, findCompanyByApiKey } from './company-api-keys'

describe('company-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.companyApiKey.update.mockResolvedValue({})
  })

  it('generates a key that starts with the public prefix and stores only its hash', async () => {
    client.companyApiKey.upsert.mockImplementation(({ create }: { create: { id: string; keyHash: string; keyPrefix: string } }) =>
      Promise.resolve({ id: create.id, keyHash: create.keyHash, keyPrefix: create.keyPrefix, createdAt: new Date(), lastUsedAt: null })
    )

    const { plaintext, meta } = await generateCompanyApiKey('company-a')

    expect(plaintext.startsWith('b2b_live_')).toBe(true)
    expect(meta.keyPrefix).toBe(plaintext.slice(0, meta.keyPrefix.length))
    const upsertArgs = client.companyApiKey.upsert.mock.calls[0][0]
    expect(upsertArgs.where).toEqual({ companyId: 'company-a' })
    expect(upsertArgs.create.keyHash).not.toBe(plaintext) // never store the plaintext
    expect(upsertArgs.create.keyHash).toHaveLength(64) // sha256 hex
  })

  it('regenerating replaces the previous key for that company (single active key)', async () => {
    client.companyApiKey.upsert.mockResolvedValue({ id: 'k1', keyPrefix: 'b2b_live_abc', createdAt: new Date(), lastUsedAt: null })
    await generateCompanyApiKey('company-a')
    const args = client.companyApiKey.upsert.mock.calls[0][0]
    expect(args.update.lastUsedAt).toBeNull()
  })

  it('findCompanyByApiKey rejects a candidate without the expected prefix without touching the DB', async () => {
    const result = await findCompanyByApiKey('not-our-format')
    expect(result).toBeNull()
    expect(client.companyApiKey.findUnique).not.toHaveBeenCalled()
  })

  it('findCompanyByApiKey looks up by hash and returns the owning company on a match', async () => {
    client.companyApiKey.findUnique.mockResolvedValue({ id: 'k1', companyId: 'company-a' })
    const result = await findCompanyByApiKey('b2b_live_somekeyvalue')
    expect(result).toEqual({ companyId: 'company-a' })
    expect(client.companyApiKey.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { lastUsedAt: expect.any(Date) } })
  })

  it('findCompanyByApiKey returns null for an unknown key', async () => {
    client.companyApiKey.findUnique.mockResolvedValue(null)
    const result = await findCompanyByApiKey('b2b_live_unknown')
    expect(result).toBeNull()
  })

  it('getCompanyApiKeyMeta returns null when the company has no key', async () => {
    client.companyApiKey.findUnique.mockResolvedValue(null)
    expect(await getCompanyApiKeyMeta('company-a')).toBeNull()
  })

  it('revokeCompanyApiKey reports whether a row was actually deleted', async () => {
    client.companyApiKey.deleteMany.mockResolvedValueOnce({ count: 1 })
    expect(await revokeCompanyApiKey('company-a')).toBe(true)
    client.companyApiKey.deleteMany.mockResolvedValueOnce({ count: 0 })
    expect(await revokeCompanyApiKey('company-b')).toBe(false)
  })
})
