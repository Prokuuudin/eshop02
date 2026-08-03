import type { AdminAccessLevel, User } from './auth-types'
import { getPermissionAccessLevel } from './admin-permissions'

export const isAdminUser = (user: User | null | undefined): boolean => {
  return user?.platformRole === 'admin'
}

export const getAdminAccessLevel = (user: User | null | undefined): AdminAccessLevel => {
  return getPermissionAccessLevel(user)
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
