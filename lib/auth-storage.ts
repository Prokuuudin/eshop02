import type { User } from './auth-types'

export const USERS_KEY = 'eshop_users'

export const CURRENT_KEY = 'eshop_current_user'

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export const findUserByEmail = (users: User[], email: string): User | undefined => {
  const normalizedEmail = normalizeEmail(email)
  return users.find((user) => user.email.toLowerCase() === normalizedEmail)
}

export const normalizeUser = (user: Partial<User>): User => ({
  id: user.id ?? `u_${Date.now()}`,
  email: user.email ?? '',
  password: user.password ?? '',
  name: user.name,
  platformRole: user.platformRole === 'admin' ? 'admin' : 'customer',
  companyId: user.companyId,
  companyName: user.companyName,
  teamRole: user.teamRole,
  approvalRequired: user.approvalRequired,
  auditLoggingEnabled: user.auditLoggingEnabled,
  phone: user.phone,
  cardNumber: user.cardNumber,
  passwordChangeSoft: user.passwordChangeSoft ?? false,
  avatarUrl: user.avatarUrl ?? '',
  checkoutProfile: user.checkoutProfile,
  bonusPoints: user.bonusPoints ?? 350,
  mustChangePassword: user.mustChangePassword ?? false,
  isNewUser: user.isNewUser ?? false,
  createdAt: user.createdAt ?? new Date().toISOString(),
})

export const notifyAuthChanged = (): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('eshop-user-changed'))
}

export const readUsers = (): User[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<Partial<User>>
    return parsed.map(normalizeUser).filter((user) => user.email)
  } catch {
    return []
  }
}

export const writeUsers = (users: User[]): void => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export const writeCurrentUser = (user: User): void => {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(user))
}

export const getCurrentUser = (): User | null => {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<User>
    return normalizeUser(parsed)
  } catch {
    return null
  }
}
