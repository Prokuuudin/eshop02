import { describe, it, expect, vi, beforeEach } from 'vitest'

const setCurrentCompany = vi.fn()
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: { getState: () => ({ setCurrentCompany, getCompanyByCardNumber: vi.fn() }) },
}))
vi.mock('@/lib/audit-log-store', () => ({
  logAuditAction: vi.fn(),
}))

import { getCurrentUser, loginUserAuto, logout, registerCardUser, submitNoCardRequest, verifyMfaAndLogin } from './auth'

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

describe('submitNoCardRequest - confirmed server persistence', () => {
  const request = {
    name: 'Anna',
    email: ' Anna@Example.com ',
    certificateData: 'data:image/jpeg;base64,AA==',
    certificateName: 'certificate.jpg',
  }

  it('reports success only after the server accepts the request', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'request-1' }),
    } as unknown as Response)

    const result = await submitNoCardRequest(request)

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/access-requests',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"email":"anna@example.com"'),
      })
    )
    expect(localStorage.getItem('access-request-store')).toBeNull()
  })

  it('does not report success when the server rejects a duplicate', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'pending_exists' }),
    } as unknown as Response)

    const result = await submitNoCardRequest(request)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ожидает рассмотрения/)
  })

  it('fails closed when the request cannot reach the server', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const result = await submitNoCardRequest(request)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Сервер недоступен/)
  })
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
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'u1', email: 'owner@example.com' } }),
    } as unknown as Response)

    const res = await loginUserAuto('  Owner@Example.com  ', 'correct-password')

    expect(res.success).toBe(true)
    const stored = getCurrentUser()
    expect(stored?.email).toBe('owner@example.com')
    expect(stored?.password).toBe('')
  })

  it('sends the original card number for direct server-side cardNumber lookup', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'u1', email: 'owner@example.com', cardNumber: 'AB-123' } }),
    } as unknown as Response)

    await loginUserAuto('AB-123', 'Welcome1!')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        body: expect.stringContaining('"identifier":"AB-123"'),
      })
    )
    expect(getCurrentUser()?.email).toBe('owner@example.com')
  })

  it('sets the current company when the verified account has one', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 'u1', email: 'buyer@example.com', companyId: 'company_1' },
      }),
    } as unknown as Response)
    localStorage.setItem(
      'eshop_users',
      JSON.stringify([{ id: 'u1', email: 'buyer@example.com', password: 'x', companyId: 'company_1' }])
    )

    await loginUserAuto('buyer@example.com', 'x')

    expect(setCurrentCompany).toHaveBeenCalledWith('company_1')
  })
})

describe('verifyMfaAndLogin — second step of an MFA-gated login', () => {
  it('on success, applies the user via the same local-state path as loginUserAuto', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'admin1', email: 'admin@example.com' } }),
    } as unknown as Response)

    const res = await verifyMfaAndLogin('challenge-token', '123456')

    expect(res.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/mfa/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeToken: 'challenge-token', code: '123456' }),
      })
    )
    // Same local-state path as loginUserAuto's success case: mirrored locally, password blanked.
    const stored = getCurrentUser()
    expect(stored?.id).toBe('admin1')
    expect(stored?.email).toBe('admin@example.com')
    expect(stored?.password).toBe('')
  })

  it('sets the current company when the verified account has one, same as loginUserAuto', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'admin1', email: 'admin@example.com', companyId: 'company_1' } }),
    } as unknown as Response)

    await verifyMfaAndLogin('challenge-token', '123456')

    expect(setCurrentCompany).toHaveBeenCalledWith('company_1')
  })

  it('returns { success: false, error } on a non-ok response, without touching local state', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    const res = await verifyMfaAndLogin('challenge-token', '000000')

    expect(res).toEqual({ success: false, error: expect.any(String) })
    expect(res.error).toMatch(/Неверный код/)
    expect(getCurrentUser()).toBeNull()
  })

  it('surfaces rate limiting distinctly from a wrong code', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response)

    const res = await verifyMfaAndLogin('challenge-token', '123456')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Слишком много попыток/)
  })

  it('fails closed when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await verifyMfaAndLogin('challenge-token', '123456')

    expect(res.success).toBe(false)
    expect(getCurrentUser()).toBeNull()
  })
})

describe('registerCardUser — server-authoritative card registration', () => {
  it('never creates a local account without a successful server round-trip', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)

    const res = await registerCardUser({ cardNumber: '9999', password: 'Welcome1!Change' })

    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('card_not_found')
    expect(getCurrentUser()).toBeNull()
  })

  it('surfaces "already registered" distinctly from "not found"', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response)

    const res = await registerCardUser({ cardNumber: '1234', password: 'Welcome1!Change' })

    expect(res.errorCode).toBe('card_already_registered')
  })

  it('surfaces the wrong shared welcome password distinctly', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    const res = await registerCardUser({ cardNumber: '1234', password: 'nope' })

    expect(res.errorCode).toBe('wrong_password')
  })

  it('surfaces rate limiting distinctly', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response)

    const res = await registerCardUser({ cardNumber: '1234', password: 'Welcome1!Change' })

    expect(res.errorCode).toBe('too_many_attempts')
  })

  it('fails closed when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await registerCardUser({ cardNumber: '1234', password: 'Welcome1!Change' })

    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('network_error')
    expect(getCurrentUser()).toBeNull()
  })

  it('sends the typed password to the server so a mistype is not silently accepted', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    await registerCardUser({ cardNumber: '1234', password: 'Welcome1!Change' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register-card',
      expect.objectContaining({
        body: expect.stringContaining('"password":"Welcome1!Change"'),
      })
    )
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

    const res = await registerCardUser({ cardNumber: '1234', name: 'Ivan', password: 'Welcome1!Change' })

    expect(res.success).toBe(true)
    const stored = getCurrentUser()
    expect(stored?.id).toBe('u_real_123')
    expect(stored?.companyId).toBe('company_1')
    expect(stored?.password).toBe('')
    expect(setCurrentCompany).toHaveBeenCalledWith('company_1')
  })

  it('surfaces a wrong personal-code digit distinctly from a wrong shared password', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'wrong_code' }),
    } as unknown as Response)

    const res = await registerCardUser({ cardNumber: '5678', password: '999' })

    expect(res.errorCode).toBe('wrong_code')
  })

  it('falls back to wrong_password on a 401 with no readable body (legacy shape)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    const res = await registerCardUser({ cardNumber: '1234', password: 'nope' })

    expect(res.errorCode).toBe('wrong_password')
  })

  it('surfaces a card with no personal code on file distinctly', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 422 } as Response)

    const res = await registerCardUser({ cardNumber: '5678', password: '221' })

    expect(res.errorCode).toBe('no_personal_code_on_file')
  })
})

describe('logout — must clear the server session, not just localStorage', () => {
  it('calls POST /api/auth/logout so the server-side session cookie is invalidated', () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response)

    logout()

    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  })

  it('still clears the local user even if the server call fails', () => {
    localStorage.setItem('eshop_current_user', JSON.stringify({ id: 'u1', email: 'a@b.com' }))
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    logout()

    expect(getCurrentUser()).toBeNull()
  })
})
