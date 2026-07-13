import { describe, it, expect, vi, beforeEach } from 'vitest'

const setCurrentCompany = vi.fn()
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: { getState: () => ({ setCurrentCompany, getCompanyByCardNumber: vi.fn() }) },
}))
vi.mock('@/lib/access-request-store', () => ({
  useAccessRequestStore: { getState: () => ({}) },
}))
vi.mock('@/lib/audit-log-store', () => ({
  logAuditAction: vi.fn(),
}))

import { getCurrentUser, loginUserAuto, registerCardUser } from './auth'

function makeLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageMock())
  vi.stubGlobal('fetch', vi.fn())
  setCurrentCompany.mockClear()
})

describe('loginUserAuto — server-authoritative login', () => {
  it('never succeeds without a successful server round-trip', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    const res = await loginUserAuto('someone@example.com', 'wrong-password')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/email или пароль/)
    expect(getCurrentUser()).toBeNull()
  })

  it('surfaces rate limiting distinctly from bad credentials', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response)

    const res = await loginUserAuto('someone@example.com', 'whatever')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Слишком много попыток/)
  })

  it('fails closed when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await loginUserAuto('someone@example.com', 'whatever')

    expect(res.success).toBe(false)
    expect(getCurrentUser()).toBeNull()
  })

  it('on success, mirrors the account locally with the password blanked out', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response)

    const res = await loginUserAuto('  Owner@Example.com  ', 'correct-password')

    expect(res.success).toBe(true)
    const stored = getCurrentUser()
    expect(stored?.email).toBe('owner@example.com')
    expect(stored?.password).toBe('')
  })

  it('resolves a card number to its deterministic internal email without reading any local directory', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response)

    await loginUserAuto('AB-123', 'Welcome1!')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sync',
      expect.objectContaining({
        body: expect.stringContaining('"email":"card.ab-123@client.local"'),
      })
    )
  })

  it('sets the current company when the verified account has one', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response)
    localStorage.setItem(
      'eshop_users',
      JSON.stringify([{ id: 'u1', email: 'buyer@example.com', password: 'x', companyId: 'company_1' }])
    )

    await loginUserAuto('buyer@example.com', 'x')

    expect(setCurrentCompany).toHaveBeenCalledWith('company_1')
  })
})

describe('registerCardUser — server-authoritative card registration', () => {
  it('never creates a local account without a successful server round-trip', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)

    const res = await registerCardUser({ cardNumber: '9999' })

    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('card_not_found')
    expect(getCurrentUser()).toBeNull()
  })

  it('surfaces "already registered" distinctly from "not found"', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response)

    const res = await registerCardUser({ cardNumber: '1234' })

    expect(res.errorCode).toBe('card_already_registered')
  })

  it('surfaces rate limiting distinctly', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response)

    const res = await registerCardUser({ cardNumber: '1234' })

    expect(res.errorCode).toBe('too_many_attempts')
  })

  it('fails closed when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await registerCardUser({ cardNumber: '1234' })

    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('network_error')
    expect(getCurrentUser()).toBeNull()
  })

  it('on success, mirrors the server-created account locally and sets the current company', async () => {
    const serverUser = {
      id: 'u_real_123',
      email: 'card.1234@client.local',
      companyId: 'company_1',
      companyName: 'SIA MIKS PLUS',
      teamRole: 'buyer',
      bonusPoints: 350,
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ user: serverUser }),
    } as unknown as Response)

    const res = await registerCardUser({ cardNumber: '1234', name: 'Ivan' })

    expect(res.success).toBe(true)
    const stored = getCurrentUser()
    expect(stored?.id).toBe('u_real_123')
    expect(stored?.companyId).toBe('company_1')
    expect(stored?.password).toBe('')
    expect(setCurrentCompany).toHaveBeenCalledWith('company_1')
  })
})
