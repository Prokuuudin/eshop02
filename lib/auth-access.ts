import type { AdminAccessLevel, User } from './auth-types'

export const isAdminUser = (user: User | null | undefined): boolean => {
  return user?.platformRole === 'admin'
}

export const getAdminAccessLevel = (user: User | null | undefined): AdminAccessLevel => {
  if (!user) return 'none'
  if (isAdminUser(user)) return 'admin'
  if (user.teamRole === 'manager' || user.teamRole === 'admin') return 'manager'
  return 'none'
}

export const canAccessAdminPanel = (user: User | null | undefined): boolean => {
  return getAdminAccessLevel(user) !== 'none'
}

export const hasFullAdminAccess = (user: User | null | undefined): boolean => {
  return getAdminAccessLevel(user) === 'admin'
}

export const canViewOrderHistory = (user: User | null | undefined): boolean => {
  if (!user) return false
  if (isAdminUser(user)) return true
  if (user.companyId) return true
  return true
}

export const canPlaceOrders = (user: User | null | undefined): boolean => {
  if (!user) return true
  if (!user.companyId) return true
  return user.teamRole === 'buyer' || user.teamRole === 'admin'
}
