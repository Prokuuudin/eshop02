import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/company-api-keys', () => ({ findCompanyByApiKey: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { findCompanyByApiKey } from '@/lib/company-api-keys'
import { authenticateRequest } from './api-helpers'

const withHeaders = (headers: Record<string, string>) =>
  new NextRequest('https://shop.test/api/v1/whatever', { headers })

const ORIGINAL_ENV = process.env.NODE_ENV
const ORIGINAL_KEYS = process.env.V1_API_KEYS

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    process.env.V1_API_KEYS = 'staticenvkey1234567890:company-static'
  })
  afterEach(() => {
    vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test')
    process.env.V1_API_KEYS = ORIGINAL_KEYS
  })

  it('authenticates a self-serve DB-issued key when it does not match any static env key', async () => {
    vi.mocked(findCompanyByApiKey).mockResolvedValue({ companyId: 'company-self-serve' })
    const result = await authenticateRequest(withHeaders({ 'x-api-key': 'b2b_live_notinenv' }))
    expect(result.authenticated).toBe(true)
    if (result.authenticated) {
      expect(result.user.companyId).toBe('company-self-serve')
      expect(result.user.apiAccess).toBe(true)
    }
  })

  it('still authenticates a static env-configured key without hitting the DB lookup', async () => {
    const result = await authenticateRequest(withHeaders({ 'x-api-key': 'staticenvkey1234567890' }))
    expect(result.authenticated).toBe(true)
    if (result.authenticated) expect(result.user.companyId).toBe('company-static')
    expect(findCompanyByApiKey).not.toHaveBeenCalled()
  })

  it('rejects a key that matches neither an env key nor a DB-issued key', async () => {
    vi.mocked(findCompanyByApiKey).mockResolvedValue(null)
    const result = await authenticateRequest(withHeaders({ 'x-api-key': 'totally-unknown-key' }))
    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.status).toBe(401)
  })

  it('rejects a self-serve key when the caller tries to widen its scope via x-company-id', async () => {
    vi.mocked(findCompanyByApiKey).mockResolvedValue({ companyId: 'company-a' })
    const result = await authenticateRequest(withHeaders({ 'x-api-key': 'b2b_live_x', 'x-company-id': 'company-b' }))
    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.status).toBe(403)
  })

  it('falls back to the session cookie when no x-api-key header is present', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1', email: 'a@b.com', companyId: 'company-a' } as never)
    const result = await authenticateRequest(withHeaders({}))
    expect(result.authenticated).toBe(true)
    if (result.authenticated) {
      expect(result.user.apiAccess).toBe(false)
      expect(result.user.companyId).toBe('company-a')
    }
    expect(findCompanyByApiKey).not.toHaveBeenCalled()
  })
})
