import type { AdminAccessLevel } from './auth-types'

export const ADMIN_PERMISSIONS = [
  'admin.access',
  'orders.read',
  'orders.update',
  'orders.refund',
  'catalog.read',
  'catalog.update',
  'prices.update',
  'customers.read',
  'customers.export',
  'rfq.read',
  'rfq.quote',
  'marketing.manage',
  'content.manage',
  'users.manage',
  'audit.read',
  'audit.manage',
  'settings.manage',
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

type PermissionSubject = {
  platformRole?: string | null
  teamRole?: string | null
} | null | undefined

const MANAGER_PERMISSIONS = new Set<AdminPermission>([
  'admin.access',
  'orders.read',
  'orders.update',
  'rfq.read',
  'rfq.quote',
])

export function getPermissionAccessLevel(subject: PermissionSubject): AdminAccessLevel {
  if (!subject) return 'none'
  if (subject.platformRole === 'admin') return 'admin'
  if (subject.teamRole === 'manager' || subject.teamRole === 'admin') return 'manager'
  return 'none'
}

export function hasAdminPermission(
  subject: PermissionSubject,
  permission: AdminPermission,
): boolean {
  const level = getPermissionAccessLevel(subject)
  if (level === 'admin') return true
  if (level === 'manager') return MANAGER_PERMISSIONS.has(permission)
  return false
}

export function getAdminPermissions(subject: PermissionSubject): AdminPermission[] {
  if (getPermissionAccessLevel(subject) === 'admin') return [...ADMIN_PERMISSIONS]
  return ADMIN_PERMISSIONS.filter((permission) => hasAdminPermission(subject, permission))
}

/** Required permission for every navigable admin area. Longest prefixes win. */
const ADMIN_PATH_PERMISSIONS: ReadonlyArray<readonly [string, AdminPermission]> = [
  ['/admin/orders/new', 'orders.update'],
  ['/admin/orders', 'orders.read'],
  ['/admin/rfq', 'rfq.read'],
  ['/admin/returns', 'orders.refund'],
  ['/admin/products/bulk-price', 'prices.update'],
  ['/admin/products', 'catalog.read'],
  ['/admin/categories', 'catalog.read'],
  ['/admin/brands', 'catalog.read'],
  ['/admin/import', 'catalog.update'],
  ['/admin/stock-alerts', 'catalog.read'],
  ['/admin/customers', 'customers.read'],
  ['/admin/client-barcodes', 'customers.read'],
  ['/admin/accounts', 'users.manage'],
  ['/admin/invitations', 'users.manage'],
  ['/admin/marketing', 'marketing.manage'],
  ['/admin/notifications', 'marketing.manage'],
  ['/admin/blog', 'content.manage'],
  ['/admin/blogs', 'content.manage'],
  ['/admin/content', 'content.manage'],
  ['/admin/analytics', 'audit.read'],
  ['/admin/sales', 'audit.read'],
  ['/admin/system/admin-log', 'audit.read'],
  ['/admin/system', 'settings.manage'],
  ['/admin/config', 'settings.manage'],
  ['/admin/bonus', 'settings.manage'],
  ['/admin/reviews', 'content.manage'],
  ['/admin/design-system', 'settings.manage'],
  ['/admin/help', 'admin.access'],
  ['/admin', 'admin.access'],
]

export function permissionForAdminPath(pathname: string): AdminPermission {
  const normalized = pathname.replace(/^\/(?:ru|en|lv)(?=\/admin(?:\/|$))/, '')
  return ADMIN_PATH_PERMISSIONS.find(([prefix]) =>
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  )?.[1] ?? 'admin.access'
}
