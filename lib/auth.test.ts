import { describe, it, expect, vi, beforeEach } from 'vitest'

const setCurrentCompany = vi.fn()
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: { getState: () => ({ setCurrentCompany, getCompanyByCardNumber: vi.fn() }) },
}))
vi.mock('@/lib/audit-log-store', () => ({
  logAuditAction: vi.fn(),
}))

import { clearNewUserFlag, getCurrentUser, loginUserAuto, logout, requestCardActivation, submitNoCardRequest, verifyMfaAndLogin, forceChangePassword } from './auth'
import { CURRENT_KEY } from './auth-storage'

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

describe('clearNewUserFlag', () => {
  it('dismisses the welcome state even when the cached users list is missing', () => {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ id: 'legacy-user', email: 'legacy@example.com', isNewUser: true }))
    clearNewUserFlag()
    expect(getCurrentUser()?.isNewUser).toBe(false)
  })
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
    expect(res.error).toBe('Неверные данные для входа')
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

    expect(res).toEqual({ success: false, error: expect.any(String), reason: 'invalid_code' })
    expect(res.error).toMatch(/Неверный код/)
    expect(getCurrentUser()).toBeNull()
  })

  it.each([
    ['500 with an error body', { ok: false, status: 500, json: async () => ({ error: 'server_error' }) }],
    ['504 timeout without JSON', { ok: false, status: 504, json: async () => { throw new SyntaxError('Unexpected token <') } }],
  ])('never reports a server failure (%s) as a wrong code', async (_label, response) => {
    vi.mocked(fetch).mockResolvedValue(response as unknown as Response)

    const res = await verifyMfaAndLogin('challenge-token', 'a1b2c3d4e5')

    expect(res.success).toBe(false)
    expect(res.reason).toBe('server')
    expect(res.error).not.toMatch(/Неверный код/)
    expect(getCurrentUser()).toBeNull()
  })

  it('reports an expired sign-in step separately from a wrong code', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_challenge' }),
    } as unknown as Response)

    const res = await verifyMfaAndLogin('challenge-token', 'a1b2c3d4e5')

    expect(res.success).toBe(false)
    expect(res.reason).toBe('expired')
    expect(getCurrentUser()).toBeNull()
  })

  it('sends a backup code through the same field and endpoint as an app code', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'admin1', email: 'admin@example.com' } }),
    } as unknown as Response)

    const res = await verifyMfaAndLogin('challenge-token', 'a1b2c3d4e5')

    expect(res.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/mfa/verify',
      expect.objectContaining({ body: JSON.stringify({ challengeToken: 'challenge-token', code: 'a1b2c3d4e5' }) })
    )
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

describe('requestCardActivation — activation link request', () => {
  it('sends only the card number and language, never a session-making payload', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({ ok: true, status: 202 } as Response)

    const res = await requestCardActivation({ cardNumber: ' 0042 ', language: 'lv' })

    expect(res).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register-card', expect.objectContaining({ method: 'POST' }))
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent).toEqual({ cardNumber: '42', language: 'lv', privacyAcknowledged: true })
    expect(getCurrentUser()).toBeNull()
  })

  it('never stores a local user, whatever the server answers', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 202, json: async () => ({ user: { id: 'u1', email: 'x@y.lv' } }),
    } as unknown as Response)

    await requestCardActivation({ cardNumber: '1234' })

    expect(getCurrentUser()).toBeNull()
  })

  it.each([
    [429, 'too_many_attempts'],
    [400, 'invalid_card'],
    [500, 'server_error'],
  ])('maps HTTP %s to %s', async (status, errorCode) => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status } as Response)

    const res = await requestCardActivation({ cardNumber: '1234' })

    expect(res).toEqual({ success: false, errorCode })
  })

  it('fails closed when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await requestCardActivation({ cardNumber: '1234' })

    expect(res).toEqual({ success: false, errorCode: 'network_error' })
    expect(getCurrentUser()).toBeNull()
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

describe('forceChangePassword — client-side length check must match the server (MIN_LENGTH = 8)', () => {
  beforeEach(() => {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ id: 'u1', email: 'a@b.com' }))
  })

  it('rejects a 7-character password locally instead of letting the server 400 it', async () => {
    const fetchMock = vi.mocked(fetch)

    const result = await forceChangePassword('sevench')

    expect(result.success).toBe(false)
    expect(result.error).toContain('8')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts an 8-character password and calls the server', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response)

    const result = await forceChangePassword('eightchr')

    expect(result.success).toBe(true)
  })
})
