import { describe, expect, it } from 'vitest'
import { readCustomerDetails, syncCheckoutProfile } from './admin-customer-details'

const columns: Parameters<typeof readCustomerDetails>[0] = {
  name: 'Column Name', phone: '+37100000000', companyName: null, customerType: 'individual',
  registrationNumber: null, vatNumber: null, legalAddress: null,
}
const profile = {
  customerType: 'individual', companyName: '', regNumber: '', vatNumber: '', legalAddress: '', bankName: '', iban: '',
  firstName: 'Anna Marija', lastName: 'Ozola', phone: '+37122222222', address: 'Brīvības 1', city: 'Rīga', postalCode: 'LV-1010',
}

/** What the admin list shows after a save: columns and profile as the PATCH would store them. */
const reloaded = (before: typeof columns & { checkoutProfile: unknown }, updates: Parameters<typeof syncCheckoutProfile>[1]) => {
  const nextProfile = syncCheckoutProfile(before, updates)
  return readCustomerDetails({ ...before, ...updates }, nextProfile === undefined ? before.checkoutProfile : nextProfile)
}

describe('readCustomerDetails', () => {
  it('prefers the customer checkout profile over the account columns', () => {
    const shown = readCustomerDetails(columns, profile)
    expect(shown).toMatchObject({ name: 'Anna Marija Ozola', phone: '+37122222222', customerType: 'individual' })
  })

  it('falls back to the columns without a profile', () => {
    expect(readCustomerDetails(columns, null)).toMatchObject({ name: 'Column Name', phone: '+37100000000', customerType: 'individual' })
    expect(readCustomerDetails(columns, ['not', 'an', 'object'])).toMatchObject({ name: 'Column Name' })
  })
})

describe('syncCheckoutProfile', () => {
  it('leaves accounts without a checkout profile alone', () => {
    expect(syncCheckoutProfile({ ...columns, checkoutProfile: null }, { name: 'New' })).toBeUndefined()
  })

  it('makes an individual → company switch survive a reload', () => {
    const before = { ...columns, checkoutProfile: profile }
    const updates = { name: 'SIA Salons', customerType: 'company' as const, registrationNumber: '40003000001', phone: '+37122222222' }
    expect(reloaded(before, updates)).toMatchObject({ name: 'SIA Salons', customerType: 'company', registrationNumber: '40003000001' })
    expect(syncCheckoutProfile(before, updates)).toMatchObject({
      customerType: 'company', companyName: 'SIA Salons', regNumber: '40003000001',
      // Customer-owned fields the admin did not edit stay as the customer entered them.
      firstName: 'Anna Marija', lastName: 'Ozola', address: 'Brīvības 1', bankName: '',
    })
  })

  it('makes a company → individual switch survive a reload', () => {
    const before = { ...columns, customerType: 'company', checkoutProfile: { ...profile, customerType: 'company', companyName: 'SIA Old', regNumber: '40003000001' } }
    const updates = { name: 'Jānis Bērziņš', customerType: 'individual' as const, registrationNumber: null, phone: '+37122222222' }
    expect(reloaded(before, updates)).toMatchObject({ name: 'Jānis Bērziņš', customerType: 'individual' })
  })

  it('keeps the customer first/last name split when the admin did not change the name', () => {
    const before = { ...columns, checkoutProfile: profile }
    const next = syncCheckoutProfile(before, { name: 'Anna Marija Ozola', phone: '+37133333333', customerType: 'individual', registrationNumber: null })
    expect(next).toMatchObject({ firstName: 'Anna Marija', lastName: 'Ozola', phone: '+37133333333' })
  })

  it('writes a changed individual name and phone so the reload shows them', () => {
    const before = { ...columns, checkoutProfile: profile }
    const updates = { name: 'Anna Kalniņa', phone: '+37144444444', customerType: 'individual' as const, registrationNumber: null }
    expect(reloaded(before, updates)).toMatchObject({ name: 'Anna Kalniņa', phone: '+37144444444' })
  })

  it('clears name and phone when the admin empties them', () => {
    const before = { ...columns, name: null, phone: null, checkoutProfile: profile }
    const updates = { name: null, phone: null, customerType: 'individual' as const, registrationNumber: null }
    expect(reloaded(before, updates)).toMatchObject({ name: null, phone: null })
  })

  it('does not copy the person name into an empty company name on an unrelated edit', () => {
    const before = { ...columns, customerType: 'company', checkoutProfile: { ...profile, customerType: 'company', companyName: '' } }
    const next = syncCheckoutProfile(before, { name: 'Column Name', phone: '+37155555555', customerType: 'company', registrationNumber: null })
    expect(next).toMatchObject({ companyName: '', phone: '+37155555555' })
  })

  it('does not touch the profile for email-only edits', () => {
    expect(syncCheckoutProfile({ ...columns, checkoutProfile: profile }, { email: 'new@example.com' })).toBeUndefined()
  })
})
