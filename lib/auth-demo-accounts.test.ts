import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedTestAccounts } from './auth-demo-accounts'
import { readUsers, USERS_KEY } from './auth-storage'

function makeLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('seedTestAccounts', () => {
  it('does nothing during server rendering', () => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())

    seedTestAccounts()

    expect(readUsers()).toEqual([])
  })

  it('does not expose demo credentials in production browsers', () => {
    const storage = makeLocalStorageMock()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', storage)
    vi.stubEnv('NODE_ENV', 'production')

    seedTestAccounts()

    expect(storage.getItem(USERS_KEY)).toBeNull()
  })

  it('adds missing development accounts once without replacing an existing admin', () => {
    const storage = makeLocalStorageMock()
    storage.setItem(USERS_KEY, JSON.stringify([
      { id: 'real-admin', email: 'owner@example.com', password: '', platformRole: 'admin' },
    ]))
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', storage)
    vi.stubEnv('NODE_ENV', 'development')

    seedTestAccounts()
    seedTestAccounts()

    const users = readUsers()
    expect(users.map((user) => user.id)).toEqual(['real-admin', 'seed_user_001'])
    expect(users.find((user) => user.id === 'seed_user_001')?.bonusPoints).toBe(350)
  })
})
