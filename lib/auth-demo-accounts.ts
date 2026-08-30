import { normalizeUser, readUsers, writeUsers } from './auth-storage'

const TEST_ADMIN_ID = 'seed_admin_001'
const TEST_USER_ID = 'seed_user_001'

export const seedTestAccounts = (): void => {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return

  const users = readUsers()
  const hasAdmin = users.some((user) => user.id === TEST_ADMIN_ID || user.platformRole === 'admin')
  const hasTestUser = users.some((user) => user.id === TEST_USER_ID)

  if (hasAdmin && hasTestUser) return

  const next = [...users]
  if (!hasAdmin) {
    next.push(normalizeUser({
      id: TEST_ADMIN_ID,
      email: 'admin@test.com',
      password: 'admin123',
      name: 'Test Admin',
      platformRole: 'admin',
      auditLoggingEnabled: true,
      bonusPoints: 0,
    }))
  }
  if (!hasTestUser) {
    next.push(normalizeUser({
      id: TEST_USER_ID,
      email: 'user@test.com',
      password: 'user123',
      name: 'Test User',
      platformRole: 'customer',
      bonusPoints: 350,
    }))
  }

  writeUsers(next)
}
