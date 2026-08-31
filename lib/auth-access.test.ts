import { describe, expect, it } from 'vitest'
import { canAccessAdminPanel, canPlaceOrders, canViewOrderHistory, getAdminAccessLevel, hasFullAdminAccess, isAdminUser } from './auth-access'
import type { User } from './auth-types'

const user = (patch: Partial<User>): User => ({ id: 'u1', email: 'u@test.com', password: 'hash', ...patch })

describe('auth access policy', () => {
  it('separates platform admins from company owners', () => {
    const platformAdmin = user({ platformRole: 'admin' })
    const companyOwner = user({ platformRole: 'customer', companyId: 'c1', teamRole: 'admin' })
    expect(isAdminUser(platformAdmin)).toBe(true)
    expect(hasFullAdminAccess(platformAdmin)).toBe(true)
    expect(canAccessAdminPanel(companyOwner)).toBe(false)
    expect(getAdminAccessLevel(companyOwner)).toBe('none')
  })

  it('allows staff managers into the limited admin panel', () => {
    const manager = user({ platformRole: 'customer', teamRole: 'manager' })
    expect(getAdminAccessLevel(manager)).toBe('manager')
    expect(canAccessAdminPanel(manager)).toBe(true)
    expect(hasFullAdminAccess(manager)).toBe(false)
  })

  it('permits company purchases only for buyer and owner roles', () => {
    expect(canPlaceOrders(user({ companyId: 'c1', teamRole: 'viewer' }))).toBe(false)
    expect(canPlaceOrders(user({ companyId: 'c1', teamRole: 'manager' }))).toBe(false)
    expect(canPlaceOrders(user({ companyId: 'c1', teamRole: 'buyer' }))).toBe(true)
    expect(canPlaceOrders(user({ companyId: 'c1', teamRole: 'admin' }))).toBe(true)
  })

  it('keeps guest checkout available while hiding order history from anonymous users', () => {
    expect(canPlaceOrders(null)).toBe(true)
    expect(canViewOrderHistory(null)).toBe(false)
    expect(canViewOrderHistory(user({}))).toBe(true)
  })
})
