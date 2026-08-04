import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getCurrentUserMock } = vi.hoisted(() => {
  return {
    getCurrentUserMock: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({
  getCurrentUser: getCurrentUserMock,
  isAdminUser: (user: { platformRole?: string } | null) => user?.platformRole === 'admin',
}))

import { useAuthStore } from './auth-store'

beforeEach(() => {
  getCurrentUserMock.mockReset()
  useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false, isHydrated: false })
})

describe('useAuthStore refresh — password-change gate', () => {
  it('treats a hard-blocked mustChangePassword user as unauthenticated', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u1', mustChangePassword: true, passwordChangeSoft: false })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('treats a soft-eligible card+PK user as fully authenticated', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u2', mustChangePassword: true, passwordChangeSoft: true })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('authenticates a normal user with no password-change flag', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u4', mustChangePassword: false, passwordChangeSoft: false })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
