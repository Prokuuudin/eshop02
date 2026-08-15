import { describe, expect, it } from 'vitest'
import { getAdminPermissions, hasAdminPermission, permissionForAdminPath } from './admin-permissions'

const manager = { platformRole: 'customer', teamRole: 'manager' }
const admin = { platformRole: 'admin' }

describe('admin permissions', () => {
  it('grants managers only order and RFQ operations', () => {
    expect(getAdminPermissions(manager)).toEqual([
      'admin.access', 'orders.read', 'orders.update', 'rfq.read', 'rfq.quote',
    ])
    expect(hasAdminPermission(manager, 'users.manage')).toBe(false)
    expect(hasAdminPermission(manager, 'catalog.update')).toBe(false)
  })

  it('grants platform admins every permission', () => {
    expect(hasAdminPermission(admin, 'users.manage')).toBe(true)
    expect(hasAdminPermission(admin, 'orders.refund')).toBe(true)
    expect(hasAdminPermission(admin, 'settings.manage')).toBe(true)
  })

  it('does not grant admin access to ordinary company roles', () => {
    expect(hasAdminPermission({ platformRole: 'customer', teamRole: 'buyer' }, 'admin.access')).toBe(false)
    expect(hasAdminPermission(null, 'orders.read')).toBe(false)
  })

  it('does not grant staff-level access to a B2B company owner (teamRole "admin")', () => {
    // Every self-service company signup (auth/invite, register-card's company
    // branch) sets User.teamRole = 'admin' to mean "owner of their own
    // company" (mirrors CompanyMember.role). That must never be confused with
    // the platform-staff 'manager' tier, or any invited customer would get
    // unscoped read/write access to every order and RFQ on the platform.
    const companyOwner = { platformRole: 'customer', teamRole: 'admin' }
    expect(getAdminPermissions(companyOwner)).toEqual([])
    expect(hasAdminPermission(companyOwner, 'admin.access')).toBe(false)
    expect(hasAdminPermission(companyOwner, 'orders.read')).toBe(false)
    expect(hasAdminPermission(companyOwner, 'rfq.read')).toBe(false)
  })

  it('maps localized and nested paths consistently', () => {
    expect(permissionForAdminPath('/lv/admin/orders/123')).toBe('orders.read')
    expect(permissionForAdminPath('/admin/orders/new')).toBe('orders.update')
    expect(permissionForAdminPath('/en/admin/products/bulk-price')).toBe('prices.update')
    expect(permissionForAdminPath('/admin/accounts')).toBe('users.manage')
  })
})
