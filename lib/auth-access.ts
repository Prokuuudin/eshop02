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

/**
 * Single ordering rule for the storefront UI and POST /api/orders (server-authoritative).
 * Company members may order only as buyer or company admin; viewer/manager may not.
 * Customers without a company (individual card accounts) may order.
 * `null` (anonymous) is not gated here for the UI's sake — the server rejects guests
 * with 401 before this check, and guests have no cart.
 */
export const canPlaceOrders = (
  user: { companyId?: string | null; teamRole?: string | null } | null | undefined,
): boolean => {
  if (!user) return true
  if (!user.companyId) return true
  return user.teamRole === 'buyer' || user.teamRole === 'admin'
}
